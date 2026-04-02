import cron from "node-cron";
import { StarkZap, StarkSigner, getPresets } from "starkzap";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import TelegramBot from "node-telegram-bot-api";
import { Resend } from "resend";

// Sending bots + email.
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!);
const resend = new Resend(process.env.RESEND_API_KEY!);

// Used for read-only chain queries (we still need a valid wallet instance).
const SERVER_KEY = process.env.MONITOR_PRIVATE_KEY!;

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

      const emoji = level === "critical" ? "🚨" : level === "danger" ? "🔴" : "⚠️";
      const msg = `${emoji} Your ${pair.collateralSymbol}/${pair.debtSymbol} position health is ${ratio.toFixed(
        3,
      )}. ${
        level === "critical"
          ? "ACT NOW — liquidation is imminent."
          : "Consider adding collateral or repaying debt."
      }`;

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

