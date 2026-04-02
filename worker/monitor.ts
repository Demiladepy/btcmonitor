import cron from "node-cron";
import { StarkZap, StarkSigner, getPresets, PrivySigner, accountPresets, Amount } from "starkzap";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import TelegramBot from "node-telegram-bot-api";
import { Resend } from "resend";
import { getPrivyClient } from "../lib/privy-server";
import { getMonitorWorkerNetwork, starkZapNetworkName } from "../lib/btc-health-network";

// Sending bots + email.
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!);
const resend = new Resend(process.env.RESEND_API_KEY!);

// Used for read-only chain queries (we still need a valid wallet instance).
const SERVER_KEY = process.env.MONITOR_PRIVATE_KEY!;

// Needed for Starknet.js/AVNU sponsored transactions.
const AVNU_PAYMASTER_API_KEY =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY ?? process.env.NEXT_PUBLIC_PAYMASTER_API_KEY;

const MARKET_DIGEST_MS = 6 * 60 * 60 * 1000;

const workerNetwork = getMonitorWorkerNetwork();
const workerNetworkName = starkZapNetworkName(workerNetwork);

function wantHealthNotification(
  level: "warning" | "danger" | "critical",
  prefs: { notifyPositions: boolean; notifyLiquidation: boolean },
): boolean {
  if (level === "warning") return prefs.notifyPositions;
  return prefs.notifyLiquidation || prefs.notifyPositions;
}

function notifyEmailTo(prefs: { notifyContactEmail: string | null }, user: { email: string | null }): string | null {
  return prefs.notifyContactEmail?.trim() || user.email || null;
}

async function fetchMarketSnapshot(): Promise<{
  btc: number;
  btc24h: number | null;
  stark: number;
  stark24h: number | null;
}> {
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
  if (typeof btc !== "number" || typeof stark !== "number") throw new Error("CoinGecko parse");
  return {
    btc,
    btc24h: typeof j.bitcoin?.usd_24h_change === "number" ? j.bitcoin.usd_24h_change : null,
    stark,
    stark24h: typeof j.starknet?.usd_24h_change === "number" ? j.starknet.usd_24h_change : null,
  };
}

async function maybeSendMarketDigest(user: {
  id: string;
  email: string | null;
  telegramChatId: string | null;
  monitoredPairs: { collateralSymbol: string; debtSymbol: string }[];
  alertPreferences: {
    notifyMarket: boolean;
    notifyYield: boolean;
    emailEnabled: boolean;
    telegramEnabled: boolean;
    notifyContactEmail: string | null;
    lastMarketDigestAt: Date | null;
  } | null;
}) {
  const prefs = user.alertPreferences;
  if (!prefs?.notifyMarket) return;
  if (!prefs.emailEnabled && !prefs.telegramEnabled) return;

  const last = prefs.lastMarketDigestAt?.getTime() ?? 0;
  if (Date.now() - last < MARKET_DIGEST_MS) return;

  const emailTo = notifyEmailTo(prefs, user);
  const sendEmail = Boolean(prefs.emailEnabled) && Boolean(emailTo);
  const sendTelegram = Boolean(prefs.telegramEnabled) && Boolean(user.telegramChatId);
  if (!sendEmail && !sendTelegram) return;

  let snap: Awaited<ReturnType<typeof fetchMarketSnapshot>>;
  try {
    snap = await fetchMarketSnapshot();
  } catch (err) {
    console.error("Market digest fetch failed:", err);
    return;
  }

  const pairSummary = user.monitoredPairs.map((p) => `${p.collateralSymbol}/${p.debtSymbol}`).join(", ");
  const yieldLine = prefs.notifyYield ? "\nYield: review Vesu lending rates for your pairs in the app." : "";

  const btcChange =
    snap.btc24h != null ? ` (${snap.btc24h >= 0 ? "+" : ""}${snap.btc24h.toFixed(2)}% 24h)` : "";
  const starkChange =
    snap.stark24h != null ? ` (${snap.stark24h >= 0 ? "+" : ""}${snap.stark24h.toFixed(2)}% 24h)` : "";

  const msg = `BTC Health — market snapshot
BTC $${snap.btc.toLocaleString("en-US", { maximumFractionDigits: 0 })}${btcChange}
STRK $${snap.stark.toFixed(4)}${starkChange}
Your pairs: ${pairSummary || "—"}${yieldLine}`;

  if (sendEmail && emailTo) {
    await resend.emails
      .send({
        from: "BTC Monitor <alerts@btcmonitor.app>",
        to: emailTo,
        subject: "BTC Health — market snapshot",
        text: msg,
      })
      .catch((e) => console.error("Resend market digest error:", e));
  }

  if (sendTelegram && user.telegramChatId) {
    await bot.sendMessage(user.telegramChatId, msg).catch((e) => console.error("Telegram market digest error:", e));
  }

  await prisma.alertPreferences.update({
    where: { userId: user.id },
    data: { lastMarketDigestAt: new Date() },
  });

  console.log(`Market digest sent for ${user.id}`);
}

async function checkUserPositions(params: {
  user: any;
  tokens: Record<string, any>;
  serverWallet: any;
}) {
  const { user, tokens, serverWallet } = params;
  const prefs = user.alertPreferences;
  if (!prefs || !user.walletAddress) return;
  if (!user.monitoredPairs?.length) return;

  const now = Date.now();

  for (const pair of user.monitoredPairs) {
    try {
      const collateralToken = (tokens as any)[pair.collateralSymbol];
      const debtToken = (tokens as any)[pair.debtSymbol];
      if (!collateralToken || !debtToken) continue;

      const health = await serverWallet.lending().getHealth({
        collateralToken,
        debtToken,
        user: user.walletAddress,
      });

      const colVal = Number(health.collateralValue);
      const dbtVal = Number(health.debtValue);

      // No debt = no risk.
      if (!Number.isFinite(dbtVal) || dbtVal === 0) continue;

      const ratio = colVal / dbtVal;

      let level: "warning" | "danger" | "critical" | null = null;
      const warningThreshold = prefs.warningThreshold.toNumber();
      const dangerThreshold = prefs.dangerThreshold.toNumber();
      const criticalThreshold = prefs.criticalThreshold.toNumber();

      if (ratio < criticalThreshold) level = "critical";
      else if (ratio < dangerThreshold) level = "danger";
      else if (ratio < warningThreshold) level = "warning";

      if (!level) continue;

      // Cooldown check per position+level.
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

      let autoprotectionNote: string | null = null;
      const isAutoProtectEligible =
        level === "critical" &&
        Boolean(prefs.autoProtectEnabled) &&
        pair.collateralSymbol === "WBTC" &&
        pair.debtSymbol === "USDC" &&
        user.monitoringEnabled === true;

      const emoji = level === "critical" ? "🚨" : level === "danger" ? "🔴" : "⚠️";
      let msg = `${emoji} Your ${pair.collateralSymbol}/${pair.debtSymbol} position health is ${ratio.toFixed(3)}. ${
        level === "critical"
          ? "ACT NOW — liquidation is imminent."
          : "Consider adding collateral or repaying debt."
      }`;

      if (isAutoProtectEligible) {
        try {
          const position = await serverWallet.lending().getPosition({
            collateralToken,
            debtToken,
            user: user.walletAddress,
          });

          const debtAmountBase = (position as any).debtAmount ?? BigInt(0);
          if (debtAmountBase <= BigInt(0)) {
            autoprotectionNote = "Auto-protect skipped: no debt detected.";
          } else {
            const repayAmountBase = (debtAmountBase * BigInt(10)) / BigInt(100); // 10%
            if (repayAmountBase <= BigInt(0)) {
              autoprotectionNote = "Auto-protect skipped: repay amount is too small.";
            } else {
              const privy = getPrivyClient();
              const privyWallet = await privy.wallets().get(user.id);
              const publicKey = (privyWallet as any)?.publicKey ?? (privyWallet as any)?.public_key;

              const paymaster = AVNU_PAYMASTER_API_KEY
                ? { headers: { "x-paymaster-api-key": AVNU_PAYMASTER_API_KEY } }
                : undefined;

              const sdk = new StarkZap({
                network: workerNetworkName,
                paymaster,
              });

              const userWallet = await sdk.connectWallet({
                account: {
                  signer: new PrivySigner({
                    walletId: user.id,
                    publicKey,
                    rawSign: async (walletId: string, messageHash: string) => {
                      const raw = await privy.wallets().rawSign(walletId, { params: { hash: messageHash } });
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
                autoprotectionNote = "Auto-protect skipped: insufficient USDC balance in the wallet.";
              } else {
                const amount = Amount.fromRaw(repayCappedBase, debtToken);
                const tx = await userWallet.lending().repay(
                  {
                    collateralToken,
                    debtToken,
                    amount,
                  },
                  { feeMode: "sponsored" },
                );

                await tx.wait();
                autoprotectionNote = `Auto-protect executed: repaid ~10% of debt. Tx: ${tx.hash}`;
              }
            }
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          autoprotectionNote = `Auto-protect failed (skipped): ${reason}`;
        }

        if (autoprotectionNote) {
          msg = `${msg}\n${autoprotectionNote}`;
        }
      }

      const wantNotify = wantHealthNotification(level, prefs);
      const emailTo = notifyEmailTo(prefs, user);
      const sendEmail = wantNotify && Boolean(prefs.emailEnabled) && Boolean(emailTo);
      const sendTelegram = wantNotify && Boolean(prefs.telegramEnabled) && Boolean(user.telegramChatId);

      if (sendEmail && emailTo) {
        await resend.emails
          .send({
            from: "BTC Monitor <alerts@btcmonitor.app>",
            to: emailTo,
            subject: `${emoji} Position Alert: ${pair.collateralSymbol}/${pair.debtSymbol}`,
            text: msg,
          })
          .catch((e) => console.error("Resend send error:", e));
      }

      if (sendTelegram && user.telegramChatId) {
        await bot.sendMessage(user.telegramChatId, msg).catch((e) => console.error("Telegram send error:", e));
      }

      await prisma.alert.create({
        data: {
          userId: user.id,
          collateralSymbol: pair.collateralSymbol,
          debtSymbol: pair.debtSymbol,
          level,
          healthRatio: new Prisma.Decimal(ratio),
          message: msg,
          emailSent: sendEmail,
          telegramSent: sendTelegram,
        },
      });

      console.log(`Alert sent: ${level} for ${user.id} on ${pair.collateralSymbol}/${pair.debtSymbol}`);
    } catch (err) {
      console.error(`Error checking ${pair.collateralSymbol}/${pair.debtSymbol} for ${user.id}:`, err);
    }
  }
}

cron.schedule("* * * * *", async () => {
  console.log("Monitor tick:", new Date().toISOString(), "network:", workerNetworkName);

  if (!SERVER_KEY) {
    console.error("MONITOR_PRIVATE_KEY not set. Monitor worker cannot run.");
    return;
  }

  const now = new Date();

  const users = await prisma.user.findMany({
    where: {
      OR: [{ monitoringEnabled: true }, { mutedUntil: { lt: now } }],
    },
    include: {
      alertPreferences: true,
      monitoredPairs: true,
    },
  });

  const sdk = new StarkZap({ network: workerNetworkName });
  const serverWallet = await sdk.connectWallet({
    account: { signer: new StarkSigner(SERVER_KEY) },
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

    if (!user.alertPreferences || !user.monitoredPairs?.length) {
      await maybeSendMarketDigest(user);
      continue;
    }
    await checkUserPositions({ user, tokens, serverWallet });
    await maybeSendMarketDigest(user);
  }
});

console.log("Monitor worker started.");
