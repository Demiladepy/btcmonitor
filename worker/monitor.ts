import cron from "node-cron";
import { StarkZap, StarkSigner, getPresets, PrivySigner, accountPresets, Amount } from "starkzap";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import TelegramBot from "node-telegram-bot-api";
import { Resend } from "resend";
import { getPrivyClient } from "../lib/privy-server";

// Sending bots + email.
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!);
const resend = new Resend(process.env.RESEND_API_KEY!);

// Used for read-only chain queries (we still need a valid wallet instance).
const SERVER_KEY = process.env.MONITOR_PRIVATE_KEY!;

// Needed for Starknet.js/AVNU sponsored transactions.
const AVNU_PAYMASTER_API_KEY =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY ?? process.env.NEXT_PUBLIC_PAYMASTER_API_KEY;

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

      // Auto-protect MVP: execute a sponsored repay on critical WBTC/USDC.
      // MVP semantics:
      // - only if monitoringEnabled === true
      // - repay amount = 10% of current debt (debt in debt-token base units)
      // - cap repay by wallet USDC balance to avoid approval/tx failures
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
          // Read current debt amount from the lending provider (base units).
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
              // Connect the user's wallet for execution via PrivySigner.
              const privy = getPrivyClient();
              const privyWallet = await privy.wallets().get(user.id);
              const publicKey = (privyWallet as any)?.publicKey ?? (privyWallet as any)?.public_key;

              const paymaster = AVNU_PAYMASTER_API_KEY
                ? { headers: { "x-paymaster-api-key": AVNU_PAYMASTER_API_KEY } }
                : undefined;

              const sdk = new StarkZap({
                network: "sepolia",
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

      const sendEmail = Boolean(prefs.emailEnabled) && Boolean(user.email);
      const sendTelegram = Boolean(prefs.telegramEnabled) && Boolean(user.telegramChatId);

      if (sendEmail) {
        await resend.emails
          .send({
            from: "BTC Monitor <alerts@btcmonitor.app>",
            to: user.email,
            subject: `${emoji} Position Alert: ${pair.collateralSymbol}/${pair.debtSymbol}`,
            text: msg,
          })
          .catch((e) => console.error("Resend send error:", e));
      }

      if (sendTelegram) {
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
  console.log("Monitor tick:", new Date().toISOString());

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

  // Create the server wallet once per tick.
  const sdk = new StarkZap({ network: "sepolia" });
  const serverWallet = await sdk.connectWallet({
    account: { signer: new StarkSigner(SERVER_KEY) },
  });

  const tokens = getPresets(serverWallet.getChainId());

  for (const user of users) {
    // Skip if still within mute window.
    if (
      user.monitoringEnabled === false &&
      user.mutedUntil &&
      user.mutedUntil.getTime() > Date.now()
    ) {
      continue;
    }

    if (!user.alertPreferences || !user.monitoredPairs?.length) continue;
    await checkUserPositions({ user, tokens, serverWallet });
  }
});

console.log("Monitor worker started.");

