import { NextResponse } from "next/server";
import { StarkZap, StarkSigner, getPresets, PrivySigner, accountPresets, Amount } from "starkzap";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { getPrivyClient } from "@/lib/privy-server";
import { getMonitorWorkerNetwork, starkZapNetworkName } from "@/lib/btc-health-network";

export const runtime = "nodejs";
export const maxDuration = 60;

const MARKET_DIGEST_MS = 6 * 60 * 60 * 1000;
const AVNU_PAYMASTER_API_KEY =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY ?? process.env.NEXT_PUBLIC_PAYMASTER_API_KEY;

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined);
}

function wantHealthNotification(
  level: "warning" | "danger" | "critical",
  prefs: { notifyPositions: boolean; notifyLiquidation: boolean },
): boolean {
  if (level === "warning") return prefs.notifyPositions;
  return prefs.notifyLiquidation || prefs.notifyPositions;
}

function notifyEmailTo(
  prefs: { notifyContactEmail: string | null },
  user: { email: string | null },
): string | null {
  return prefs.notifyContactEmail?.trim() || user.email || null;
}

async function fetchMarketSnapshot() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,starknet&vs_currencies=usd&include_24hr_change=true";
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
  const j = (await r.json()) as {
    bitcoin?: { usd?: number; usd_24h_change?: number };
    starknet?: { usd?: number; usd_24h_change?: number };
  };
  const btc = j.bitcoin?.usd;
  const stark = j.starknet?.usd;
  if (typeof btc !== "number" || typeof stark !== "number") throw new Error("CoinGecko parse error");
  return {
    btc,
    btc24h: typeof j.bitcoin?.usd_24h_change === "number" ? j.bitcoin.usd_24h_change : null,
    stark,
    stark24h: typeof j.starknet?.usd_24h_change === "number" ? j.starknet.usd_24h_change : null,
  };
}

async function maybeSendMarketDigest(user: any, resend: Resend) {
  const prefs = user.alertPreferences;
  if (!prefs?.notifyMarket) return;
  if (!prefs.emailEnabled && !prefs.telegramEnabled) return;

  const last = prefs.lastMarketDigestAt?.getTime() ?? 0;
  if (Date.now() - last < MARKET_DIGEST_MS) return;

  const emailTo = notifyEmailTo(prefs, user);
  const doEmail = Boolean(prefs.emailEnabled) && Boolean(emailTo);
  const doTelegram = Boolean(prefs.telegramEnabled) && Boolean(user.telegramChatId);
  if (!doEmail && !doTelegram) return;

  let snap: Awaited<ReturnType<typeof fetchMarketSnapshot>>;
  try {
    snap = await fetchMarketSnapshot();
  } catch {
    return;
  }

  const pairSummary = user.monitoredPairs
    .map((p: any) => `${p.collateralSymbol}/${p.debtSymbol}`)
    .join(", ");
  const yieldLine = prefs.notifyYield
    ? "\nYield: review Vesu lending rates for your pairs in the app."
    : "";
  const btcChange =
    snap.btc24h != null
      ? ` (${snap.btc24h >= 0 ? "+" : ""}${snap.btc24h.toFixed(2)}% 24h)`
      : "";
  const starkChange =
    snap.stark24h != null
      ? ` (${snap.stark24h >= 0 ? "+" : ""}${snap.stark24h.toFixed(2)}% 24h)`
      : "";

  const msg = `BTC Health — market snapshot
BTC $${snap.btc.toLocaleString("en-US", { maximumFractionDigits: 0 })}${btcChange}
STRK $${snap.stark.toFixed(4)}${starkChange}
Your pairs: ${pairSummary || "—"}${yieldLine}`;

  if (doEmail && emailTo) {
    await resend.emails
      .send({
        from: "BTC Monitor <alerts@btcmonitor.app>",
        to: emailTo,
        subject: "BTC Health — market snapshot",
        text: msg,
      })
      .catch(() => undefined);
  }

  if (doTelegram && user.telegramChatId) {
    await sendTelegram(user.telegramChatId, msg);
  }

  await prisma.alertPreferences.update({
    where: { userId: user.id },
    data: { lastMarketDigestAt: new Date() },
  });
}

async function checkUserPositions(params: {
  user: any;
  tokens: Record<string, any>;
  serverWallet: any;
  resend: Resend;
  errors: string[];
}) {
  const { user, tokens, serverWallet, resend, errors } = params;
  const prefs = user.alertPreferences;
  if (!prefs || !user.walletAddress || !user.monitoredPairs?.length) return;

  const now = Date.now();

  for (const pair of user.monitoredPairs) {
    try {
      const collateralToken = tokens[pair.collateralSymbol];
      const debtToken = tokens[pair.debtSymbol];
      if (!collateralToken || !debtToken) continue;

      const health = await serverWallet.lending().getHealth({
        collateralToken,
        debtToken,
        user: user.walletAddress,
      });

      const colVal = Number(health.collateralValue);
      const dbtVal = Number(health.debtValue);
      if (!Number.isFinite(dbtVal) || dbtVal === 0) continue;

      const ratio = colVal / dbtVal;
      const warningThreshold = prefs.warningThreshold.toNumber();
      const dangerThreshold = prefs.dangerThreshold.toNumber();
      const criticalThreshold = prefs.criticalThreshold.toNumber();

      let level: "warning" | "danger" | "critical" | null = null;
      if (ratio < criticalThreshold) level = "critical";
      else if (ratio < dangerThreshold) level = "danger";
      else if (ratio < warningThreshold) level = "warning";
      if (!level) continue;

      const recent = await prisma.alert.findFirst({
        where: {
          userId: user.id,
          collateralSymbol: pair.collateralSymbol,
          debtSymbol: pair.debtSymbol,
          level,
          createdAt: { gte: new Date(now - prefs.cooldownMinutes * 60_000) },
        },
      });
      if (recent) continue;

      const emoji = level === "critical" ? "🚨" : level === "danger" ? "🔴" : "⚠️";
      let msg = `${emoji} Your ${pair.collateralSymbol}/${pair.debtSymbol} position health is ${ratio.toFixed(3)}. ${
        level === "critical"
          ? "ACT NOW — liquidation is imminent."
          : "Consider adding collateral or repaying debt."
      }`;

      // Auto-protect: attempt gasless repay for critical WBTC/USDC positions.
      const isAutoProtectEligible =
        level === "critical" &&
        Boolean(prefs.autoProtectEnabled) &&
        pair.collateralSymbol === "WBTC" &&
        pair.debtSymbol === "USDC" &&
        user.monitoringEnabled === true;

      if (isAutoProtectEligible) {
        let note: string;
        try {
          const position = await serverWallet.lending().getPosition({
            collateralToken,
            debtToken,
            user: user.walletAddress,
          });
          const debtAmountBase = (position as any).debtAmount ?? BigInt(0);
          if (debtAmountBase <= BigInt(0)) {
            note = "Auto-protect skipped: no debt detected.";
          } else {
            const repayAmountBase = (debtAmountBase * BigInt(10)) / BigInt(100);
            if (repayAmountBase <= BigInt(0)) {
              note = "Auto-protect skipped: repay amount too small.";
            } else {
              const privy = getPrivyClient();
              const privyWallet = await privy.wallets().get(user.id);
              const publicKey =
                (privyWallet as any)?.publicKey ?? (privyWallet as any)?.public_key;
              const paymaster = AVNU_PAYMASTER_API_KEY
                ? { headers: { "x-paymaster-api-key": AVNU_PAYMASTER_API_KEY } }
                : undefined;
              const sdk = new StarkZap({
                network: starkZapNetworkName(getMonitorWorkerNetwork()),
                paymaster,
              });
              const userWallet = await sdk.connectWallet({
                account: {
                  signer: new PrivySigner({
                    walletId: user.id,
                    publicKey,
                    rawSign: async (walletId: string, messageHash: string) => {
                      const raw = await privy
                        .wallets()
                        .rawSign(walletId, { params: { hash: messageHash } });
                      return raw.signature;
                    },
                  }),
                  accountClass: accountPresets.argentXV050,
                },
                accountAddress: user.walletAddress,
                feeMode: "sponsored",
              });
              await userWallet.ensureReady({ deploy: "if_needed", feeMode: "sponsored" });
              const userUsdcBal = await userWallet.balanceOf(debtToken);
              const userUsdcBalBase = userUsdcBal.toBase();
              const repayCappedBase =
                repayAmountBase > userUsdcBalBase ? userUsdcBalBase : repayAmountBase;
              if (repayCappedBase <= BigInt(0)) {
                note = "Auto-protect skipped: insufficient USDC balance.";
              } else {
                const amount = Amount.fromRaw(repayCappedBase, debtToken);
                const tx = await userWallet
                  .lending()
                  .repay({ collateralToken, debtToken, amount }, { feeMode: "sponsored" });
                await tx.wait();
                note = `Auto-protect executed: repaid ~10% of debt. Tx: ${tx.hash}`;
              }
            }
          }
        } catch (err) {
          note = `Auto-protect failed: ${err instanceof Error ? err.message : String(err)}`;
        }
        msg = `${msg}\n${note!}`;
      }

      const wantNotify = wantHealthNotification(level, prefs);
      const emailTo = notifyEmailTo(prefs, user);
      const doEmail = wantNotify && Boolean(prefs.emailEnabled) && Boolean(emailTo);
      const doTelegram = wantNotify && Boolean(prefs.telegramEnabled) && Boolean(user.telegramChatId);

      if (doEmail && emailTo) {
        await resend.emails
          .send({
            from: "BTC Monitor <alerts@btcmonitor.app>",
            to: emailTo,
            subject: `${emoji} Position Alert: ${pair.collateralSymbol}/${pair.debtSymbol}`,
            text: msg,
          })
          .catch(() => undefined);
      }

      if (doTelegram && user.telegramChatId) {
        await sendTelegram(user.telegramChatId, msg);
      }

      await prisma.alert.create({
        data: {
          userId: user.id,
          collateralSymbol: pair.collateralSymbol,
          debtSymbol: pair.debtSymbol,
          level,
          healthRatio: new Prisma.Decimal(ratio),
          message: msg,
          emailSent: doEmail,
          telegramSent: doTelegram,
        },
      });
    } catch (err) {
      errors.push(
        `${pair.collateralSymbol}/${pair.debtSymbol}@${user.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

export async function GET(req: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.MONITOR_PRIVATE_KEY) {
    return NextResponse.json({ error: "MONITOR_PRIVATE_KEY not configured" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const workerNetworkName = starkZapNetworkName(getMonitorWorkerNetwork());
  const errors: string[] = [];
  let usersChecked = 0;

  try {
    const now = new Date();
    const users = await prisma.user.findMany({
      where: { OR: [{ monitoringEnabled: true }, { mutedUntil: { lt: now } }] },
      include: { alertPreferences: true, monitoredPairs: true },
      take: 100,
    });

    const sdk = new StarkZap({ network: workerNetworkName });
    const serverWallet = await sdk.connectWallet({
      account: { signer: new StarkSigner(process.env.MONITOR_PRIVATE_KEY!) },
    });
    const tokens = getPresets(serverWallet.getChainId());

    for (const user of users) {
      if (
        user.monitoringEnabled === false &&
        user.mutedUntil &&
        user.mutedUntil.getTime() > Date.now()
      ) {
        continue;
      }
      usersChecked++;
      await checkUserPositions({ user, tokens, serverWallet, resend, errors });
      await maybeSendMarketDigest(user, resend);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Monitor error" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    usersChecked,
    errors: errors.slice(0, 10),
    timestamp: new Date().toISOString(),
  });
}
