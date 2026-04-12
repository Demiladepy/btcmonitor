import { NextResponse } from "next/server";
import { StarkZap, StarkSigner, getPresets, PrivySigner, accountPresets, Amount } from "starkzap";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { getPrivyClient } from "@/lib/privy-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MARKET_DIGEST_MS = 6 * 60 * 60 * 1000;
const AVNU_PAYMASTER_API_KEY =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY ?? process.env.NEXT_PUBLIC_PAYMASTER_API_KEY;
const AVNU_PAYMASTER_URL =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_URL ?? "https://starknet.paymaster.avnu.fi";
const MAX_LTV = 0.80; // Vesu typical max loan-to-value

// ── Price helpers ─────────────────────────────────────────────────────────────

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,starknet&vs_currencies=usd&include_24hr_change=true";

interface PriceMap {
  bitcoin: number;
  ethereum: number;
  starknet: number;
  bitcoin24h: number | null;
  starknet24h: number | null;
}

async function fetchPrices(): Promise<PriceMap> {
  const r = await fetch(COINGECKO_URL, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
  const j = (await r.json()) as any;
  if (!j.bitcoin?.usd) throw new Error("CoinGecko parse error");
  return {
    bitcoin: j.bitcoin.usd,
    ethereum: j.ethereum?.usd ?? 0,
    starknet: j.starknet?.usd ?? 0,
    bitcoin24h: j.bitcoin?.usd_24h_change ?? null,
    starknet24h: j.starknet?.usd_24h_change ?? null,
  };
}

/** CoinGecko ID for collateral token symbol */
function priceId(symbol: string): keyof PriceMap | null {
  switch (symbol) {
    case "WBTC":
    case "LBTC":
    case "TBTC":
      return "bitcoin";
    case "ETH":
      return "ethereum";
    case "STRK":
      return "starknet";
    default:
      return null;
  }
}

// ── Liquidation price ─────────────────────────────────────────────────────────

function calcLiquidationPrice(
  debtValueUSD: number,
  collateralAmountRaw: bigint,
  collateralDecimals: number,
  maxLtv: number,
): number | null {
  if (collateralAmountRaw <= BigInt(0) || debtValueUSD <= 0) return null;
  const amount = Number(collateralAmountRaw) / 10 ** collateralDecimals;
  if (amount <= 0) return null;
  return debtValueUSD / (amount * maxLtv);
}

// ── Telegram helper ───────────────────────────────────────────────────────────

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => undefined);
}

// ── Alert message builder ─────────────────────────────────────────────────────

function buildAlertMessage(params: {
  collateralSymbol: string;
  debtSymbol: string;
  healthRatio: number;
  collateralValueUSD: number;
  debtValueUSD: number;
  collateralAmountHuman: number | null;
  debtAmountHuman: number | null;
  liquidationPrice: number | null;
  currentPrice: number | null;
  distancePct: number | null;
  level: "warning" | "danger" | "critical";
  autoProtectNote?: string;
}): string {
  const {
    collateralSymbol, debtSymbol, healthRatio, collateralValueUSD, debtValueUSD,
    collateralAmountHuman, debtAmountHuman, liquidationPrice, currentPrice,
    distancePct, level, autoProtectNote,
  } = params;

  const emoji = level === "critical" ? "🚨" : level === "danger" ? "🔴" : "⚠️";
  let msg = `${emoji} <b>${collateralSymbol}/${debtSymbol}</b>\n\n`;
  msg += `Health Ratio: <b>${healthRatio.toFixed(3)}</b>\n`;

  if (collateralAmountHuman !== null) {
    msg += `Collateral: ${collateralAmountHuman.toFixed(6)} ${collateralSymbol}`;
    msg += ` ($${collateralValueUSD.toFixed(0)})\n`;
  } else {
    msg += `Collateral Value: $${collateralValueUSD.toFixed(0)}\n`;
  }

  if (debtAmountHuman !== null) {
    msg += `Debt: ${debtAmountHuman.toFixed(2)} ${debtSymbol}\n`;
  } else {
    msg += `Debt Value: $${debtValueUSD.toFixed(0)}\n`;
  }

  if (liquidationPrice !== null && currentPrice !== null) {
    msg += `\n${collateralSymbol} Price Now: $${currentPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}\n`;
    msg += `Liquidation Price: <b>$${liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</b>\n`;
    if (distancePct !== null) {
      msg += `Distance: ${distancePct.toFixed(1)}% drop needed\n`;
    }
  }

  msg += "\n";
  if (level === "critical") {
    msg += "⚡ <b>URGENT:</b> Liquidation is imminent. Add collateral or repay debt NOW.";
  } else if (level === "danger") {
    msg += "🔴 Position is approaching liquidation. Take action soon.";
  } else {
    msg += "⚠️ Monitor this position — health is declining.";
  }

  if (autoProtectNote) msg += `\n\n${autoProtectNote}`;
  return msg;
}

// ── User position checker ─────────────────────────────────────────────────────

function wantNotify(
  level: "warning" | "danger" | "critical",
  prefs: { notifyPositions: boolean; notifyLiquidation: boolean },
): boolean {
  if (level === "warning") return prefs.notifyPositions;
  return prefs.notifyLiquidation || prefs.notifyPositions;
}

function notifyEmail(
  prefs: { notifyContactEmail: string | null },
  user: { email: string | null },
): string | null {
  return prefs.notifyContactEmail?.trim() || user.email || null;
}

async function checkUserPositions(params: {
  user: any;
  tokens: Record<string, any>;
  serverWallet: any;
  prices: PriceMap;
  resend: Resend;
  errors: string[];
  alertStats: { sent: number };
}) {
  const { user, tokens, serverWallet, prices, resend, errors, alertStats } = params;
  const prefs = user.alertPreferences;
  if (!prefs || !user.walletAddress || !user.monitoredPairs?.length) return;

  const now = Date.now();
  const liquidationDistancePct: number = prefs.liquidationDistancePct ?? 15;

  for (const pair of user.monitoredPairs) {
    try {
      const collateralToken = tokens[pair.collateralSymbol];
      const debtToken = tokens[pair.debtSymbol];
      if (!collateralToken || !debtToken) continue;

      const [position, health] = await Promise.all([
        serverWallet.lending().getPosition({
          collateralToken,
          debtToken,
          user: user.walletAddress,
        }),
        serverWallet.lending().getHealth({
          collateralToken,
          debtToken,
          user: user.walletAddress,
        }),
      ]);

      const colVal = Number(health.collateralValue);
      const dbtVal = Number(health.debtValue);
      if (!Number.isFinite(dbtVal) || dbtVal === 0) continue;

      const ratio = colVal / dbtVal;
      const collateralDecimals: number = (collateralToken as any).decimals ?? 8;
      const debtDecimals: number = (debtToken as any).decimals ?? 6;
      const collateralAmountRaw: bigint = (position as any).collateralAmount ?? BigInt(0);
      const debtAmountRaw: bigint = (position as any).debtAmount ?? BigInt(0);

      const collateralValueUSD = colVal / 1e18;
      const debtValueUSD = dbtVal / 1e18;
      const collateralAmountHuman =
        collateralAmountRaw > BigInt(0) ? Number(collateralAmountRaw) / 10 ** collateralDecimals : null;
      const debtAmountHuman =
        debtAmountRaw > BigInt(0) ? Number(debtAmountRaw) / 10 ** debtDecimals : null;

      // Liquidation price
      const liquidationPrice = calcLiquidationPrice(
        debtValueUSD,
        collateralAmountRaw,
        collateralDecimals,
        MAX_LTV,
      );

      // Current price for this collateral
      const pgId = priceId(pair.collateralSymbol);
      const currentPrice = pgId ? prices[pgId] ?? null : null;

      const distancePct =
        liquidationPrice !== null && currentPrice !== null && currentPrice > 0
          ? ((currentPrice - liquidationPrice) / currentPrice) * 100
          : null;

      // Determine alert level
      const warningThreshold = prefs.warningThreshold.toNumber();
      const dangerThreshold = prefs.dangerThreshold.toNumber();
      const criticalThreshold = prefs.criticalThreshold.toNumber();

      let level: "warning" | "danger" | "critical" | null = null;
      if (ratio < criticalThreshold) {
        level = "critical";
      } else if (ratio < dangerThreshold) {
        level = "danger";
      } else if (ratio < warningThreshold) {
        level = "warning";
      }

      // Escalate to critical if within liquidationDistancePct % of liquidation
      if (distancePct !== null && distancePct < liquidationDistancePct && level !== "critical") {
        level = level === null ? "danger" : "critical";
      }

      if (!level) continue;

      // Cooldown check
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

      // Auto-protect: gasless repay for critical Privy WBTC/USDC positions
      let autoProtectNote: string | undefined;
      const isAutoProtectEligible =
        level === "critical" &&
        Boolean(prefs.autoProtectEnabled) &&
        pair.collateralSymbol === "WBTC" &&
        pair.debtSymbol === "USDC" &&
        user.monitoringEnabled === true &&
        user.connectionMethod === "privy";

      if (isAutoProtectEligible) {
        try {
          const debtAmountBase = (position as any).debtAmount ?? BigInt(0);
          if (debtAmountBase <= BigInt(0)) {
            autoProtectNote = "Auto-protect skipped: no debt.";
          } else {
            const repayBase = (debtAmountBase * BigInt(10)) / BigInt(100);
            if (repayBase <= BigInt(0)) {
              autoProtectNote = "Auto-protect skipped: amount too small.";
            } else {
              const privy = getPrivyClient();
              const privyWalletId = user.privyWalletId ?? user.id;
              const privyWallet = await privy.wallets().get(privyWalletId);
              const publicKey = (privyWallet as any)?.publicKey ?? (privyWallet as any)?.public_key;
              const paymaster = AVNU_PAYMASTER_API_KEY
                ? {
                    nodeUrl: AVNU_PAYMASTER_URL,
                    headers: { "x-paymaster-api-key": AVNU_PAYMASTER_API_KEY },
                  }
                : undefined;

              const sdk = new StarkZap({ network: "mainnet", paymaster });
              const userWallet = await sdk.connectWallet({
                account: {
                  signer: new PrivySigner({
                    walletId: privyWalletId,
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
              const usdcBalBase = userUsdcBal.toBase();
              const repayCapped = repayBase > usdcBalBase ? usdcBalBase : repayBase;

              if (repayCapped <= BigInt(0)) {
                autoProtectNote = "Auto-protect skipped: insufficient USDC balance.";
              } else {
                const amount = Amount.fromRaw(repayCapped, debtToken);
                const tx = await userWallet
                  .lending()
                  .repay({ collateralToken, debtToken, amount }, { feeMode: "sponsored" });
                await tx.wait();
                autoProtectNote = `Auto-protect executed: repaid ~10% of debt. Tx: ${tx.hash}`;
              }
            }
          }
        } catch (err) {
          autoProtectNote = `Auto-protect failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      // Build message
      const msg = buildAlertMessage({
        collateralSymbol: pair.collateralSymbol,
        debtSymbol: pair.debtSymbol,
        healthRatio: ratio,
        collateralValueUSD,
        debtValueUSD,
        collateralAmountHuman,
        debtAmountHuman,
        liquidationPrice,
        currentPrice,
        distancePct,
        level,
        autoProtectNote,
      });

      const shouldNotify = wantNotify(level, prefs);
      const emailTo = notifyEmail(prefs, user);
      const doEmail = shouldNotify && Boolean(prefs.emailEnabled) && Boolean(emailTo);
      const doTelegram =
        shouldNotify && Boolean(prefs.telegramEnabled) && Boolean(user.telegramChatId);

      if (doEmail && emailTo) {
        const emoji = level === "critical" ? "🚨" : level === "danger" ? "🔴" : "⚠️";
        await resend.emails
          .send({
            from: "BTC Monitor <alerts@btcmonitor.app>",
            to: emailTo,
            subject: `${emoji} Position Alert: ${pair.collateralSymbol}/${pair.debtSymbol}`,
            text: msg.replace(/<[^>]+>/g, ""), // strip HTML for plain text email
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
          liquidationPrice: liquidationPrice ?? undefined,
          currentPrice: currentPrice ?? undefined,
          distancePct: distancePct ?? undefined,
          emailSent: doEmail,
          telegramSent: doTelegram,
        },
      });
      alertStats.sent += 1;
    } catch (err) {
      errors.push(
        `${pair.collateralSymbol}/${pair.debtSymbol}@${user.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

// ── Market digest ─────────────────────────────────────────────────────────────

async function maybeSendMarketDigest(user: any, prices: PriceMap, resend: Resend) {
  const prefs = user.alertPreferences;
  if (!prefs?.notifyMarket) return;
  if (!prefs.emailEnabled && !prefs.telegramEnabled) return;

  const last = prefs.lastMarketDigestAt?.getTime() ?? 0;
  if (Date.now() - last < MARKET_DIGEST_MS) return;

  const emailTo = notifyEmail(prefs, user);
  const doEmail = Boolean(prefs.emailEnabled) && Boolean(emailTo);
  const doTelegram = Boolean(prefs.telegramEnabled) && Boolean(user.telegramChatId);
  if (!doEmail && !doTelegram) return;

  const pairSummary = user.monitoredPairs
    .map((p: any) => `${p.collateralSymbol}/${p.debtSymbol}`)
    .join(", ");
  const btcChange =
    prices.bitcoin24h != null
      ? ` (${prices.bitcoin24h >= 0 ? "+" : ""}${prices.bitcoin24h.toFixed(2)}% 24h)`
      : "";
  const starkChange =
    prices.starknet24h != null
      ? ` (${prices.starknet24h >= 0 ? "+" : ""}${prices.starknet24h.toFixed(2)}% 24h)`
      : "";

  const msg = `BTC Health — market snapshot\nBTC $${prices.bitcoin.toLocaleString("en-US", { maximumFractionDigits: 0 })}${btcChange}\nETH $${prices.ethereum.toLocaleString("en-US", { maximumFractionDigits: 0 })}\nSTRK $${prices.starknet.toFixed(4)}${starkChange}\nYour pairs: ${pairSummary || "—"}`;

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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    const urlSecret = new URL(req.url).searchParams.get("secret");
    if (
      authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      urlSecret !== process.env.CRON_SECRET
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.MONITOR_PRIVATE_KEY) {
    return NextResponse.json({ error: "MONITOR_PRIVATE_KEY not configured" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const errors: string[] = [];
  const alertStats = { sent: 0 };
  let usersChecked = 0;

  try {
    const now = new Date();
    const users = await prisma.user.findMany({
      where: { OR: [{ monitoringEnabled: true }, { mutedUntil: { lt: now } }] },
      include: { alertPreferences: true, monitoredPairs: true },
      take: 100,
    });

    const paymaster = AVNU_PAYMASTER_API_KEY
      ? {
          nodeUrl: AVNU_PAYMASTER_URL,
          headers: { "x-paymaster-api-key": AVNU_PAYMASTER_API_KEY },
        }
      : undefined;

    const sdk = new StarkZap({ network: "mainnet", paymaster });
    const serverWallet = await sdk.connectWallet({
      account: { signer: new StarkSigner(process.env.MONITOR_PRIVATE_KEY!) },
    });
    const tokens = getPresets(serverWallet.getChainId());

    // Fetch prices once for all users
    const prices = await fetchPrices().catch(() => null);
    if (!prices) {
      return NextResponse.json({ error: "Failed to fetch prices from CoinGecko" }, { status: 500 });
    }

    for (const user of users) {
      if (
        user.monitoringEnabled === false &&
        user.mutedUntil &&
        user.mutedUntil.getTime() > Date.now()
      ) {
        continue;
      }
      usersChecked++;
      await checkUserPositions({ user, tokens, serverWallet, prices, resend, errors, alertStats });
      await maybeSendMarketDigest(user, prices, resend);
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
    alertsSent: alertStats.sent,
    errors: errors.slice(0, 10),
    timestamp: new Date().toISOString(),
  });
}
