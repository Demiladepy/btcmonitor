import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/notifications/telegram/setup
 * Registers the Telegram webhook with the Bot API.
 * Call once after deploy (or via the Alerts page "Register Bot" button).
 */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  // Derive the app URL: explicit env var wins, then Host header, then Vercel system env.
  const host =
    process.env.VITE_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.VERCEL_URL?.trim()?.replace(/^/, "https://") ||
    `https://${req.headers.get("host")}`;

  const webhookUrl = `${host}/api/notifications/telegram/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!data.ok) {
    return NextResponse.json(
      { error: `Telegram setWebhook failed: ${data.description ?? JSON.stringify(data)}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, webhookUrl });
}

/** GET — returns current webhook info from Telegram. */
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data);
}
