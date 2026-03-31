import type { VercelRequest, VercelResponse } from "@vercel/node";
import TelegramBot from "node-telegram-bot-api";
import type { AlertEvent } from "../src/lib/notificationTypes";

const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
const rateLimitMap = new Map<string, number>();

function formatMessage(event: AlertEvent): string {
  const hr =
    event.healthRatio !== undefined
      ? event.healthRatio === Infinity
        ? "∞"
        : event.healthRatio.toFixed(2)
      : null;

  switch (event.type) {
    case "liquidation_risk":
      return (
        `⚠️ *BTC Health Monitor Alert*\n\n` +
        `Your position is at *liquidation risk*\\!\n\n` +
        `Health Ratio: *${hr}*\n` +
        `Threshold: *${event.threshold?.toFixed(2) ?? "1.20"}*\n\n` +
        `👉 [Open BTC Health Monitor](${process.env.VITE_APP_URL ?? "https://btchealth.vercel.app"})\n\n` +
        `_Act now to avoid liquidation \\— repay debt or add collateral\\._`
      );
    case "health_recovered":
      return (
        `✅ *BTC Health Monitor*\n\n` +
        `Your position health has *recovered*\\!\n\n` +
        `Health Ratio: *${hr}*\n\n` +
        `👉 [Open BTC Health Monitor](${process.env.VITE_APP_URL ?? "https://btchealth.vercel.app"})`
      );
    case "yield_earned":
      return (
        `💰 *BTC Health Monitor*\n\n` +
        `You have accrued yield on your position\\.\n\n` +
        `${event.message ?? ""}\n\n` +
        `👉 [Open BTC Health Monitor](${process.env.VITE_APP_URL ?? "https://btchealth.vercel.app"})`
      );
    default:
      return `📊 *BTC Health Monitor*\n\n${event.message ?? "Position update."}`;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate shared secret to prevent public abuse
  const secret = process.env.ALERT_API_SECRET;
  if (secret && req.headers["x-alert-secret"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "Telegram bot not configured" });
  }

  const { chatId, event } = req.body as { chatId: string; event: AlertEvent };

  if (!chatId || !event?.type) {
    return res.status(400).json({ error: "Missing chatId or event" });
  }

  // Server-side rate limit (per chatId + event type)
  const key = `${chatId}:${event.type}`;
  const last = rateLimitMap.get(key) ?? 0;
  if (Date.now() - last < RATE_LIMIT_MS) {
    return res.status(429).json({ error: "Rate limited" });
  }
  rateLimitMap.set(key, Date.now());

  try {
    const bot = new TelegramBot(token);
    await bot.sendMessage(chatId, formatMessage(event), {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    } as Parameters<typeof bot.sendMessage>[2]);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Telegram send error:", e);
    return res.status(500).json({ error: "Failed to send message" });
  }
}
