import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import type { AlertEvent } from "../src/lib/notificationTypes";

const RATE_LIMIT_MS = 5 * 60 * 1000;
const rateLimitMap = new Map<string, number>();

function formatSubject(event: AlertEvent): string {
  switch (event.type) {
    case "liquidation_risk": return "⚠️ BTC Health Alert — Liquidation Risk";
    case "health_recovered": return "✅ BTC Health Alert — Position Recovered";
    case "yield_earned": return "💰 BTC Health Alert — Yield Earned";
    default: return "📊 BTC Health Monitor Alert";
  }
}

function formatHtml(event: AlertEvent): string {
  const appUrl = process.env.VITE_APP_URL ?? "https://btchealth.vercel.app";
  const hr =
    event.healthRatio !== undefined
      ? event.healthRatio === Infinity ? "∞" : event.healthRatio.toFixed(2)
      : "—";

  const statusColor =
    event.type === "liquidation_risk" ? "#ef4444"
    : event.type === "health_recovered" ? "#22c55e"
    : "#f59e0b";

  const statusIcon =
    event.type === "liquidation_risk" ? "⚠️"
    : event.type === "health_recovered" ? "✅"
    : "💰";

  const bodyText =
    event.type === "liquidation_risk"
      ? `Your BTC lending position on Vesu is at <strong>liquidation risk</strong>. Your health ratio has dropped to <strong>${hr}</strong>, below your alert threshold of <strong>${event.threshold?.toFixed(2) ?? "1.20"}</strong>.<br><br>Act now — repay debt or add collateral to avoid liquidation.`
      : event.type === "health_recovered"
      ? `Good news! Your BTC position health has recovered. Current health ratio: <strong>${hr}</strong>.`
      : event.message ?? "Your position has an update.";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;max-width:560px;width:100%">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#f7931a,#ff6b00);padding:24px 32px">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:22px;font-weight:700;color:#fff">₿ BTC Health Monitor</td>
            <td align="right" style="font-size:28px">${statusIcon}</td>
          </tr></table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">
          <p style="margin:0 0 16px;font-size:20px;font-weight:600;color:${statusColor}">${formatSubject(event).replace(/^[^ ]+ /, "")}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#ccc">${bodyText}</p>
          ${hr !== "—" ? `
          <table cellpadding="0" cellspacing="0" style="background:#111;border-radius:8px;padding:16px 20px;margin-bottom:24px;width:100%"><tr>
            <td style="font-size:13px;color:#666">Health Ratio</td>
            <td align="right" style="font-size:22px;font-weight:700;color:${statusColor}">${hr}</td>
          </tr></table>` : ""}
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${appUrl}" style="display:inline-block;background:#f7931a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px">Open Dashboard →</a>
          </td></tr></table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #2a2a2a">
          <p style="margin:0;font-size:12px;color:#444">BTC Health Monitor • Starknet Sepolia • <a href="${appUrl}" style="color:#666">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Email not configured" });
  }

  const { email, event } = req.body as { email: string; event: AlertEvent };

  if (!email || !event?.type) {
    return res.status(400).json({ error: "Missing email or event" });
  }

  // Server-side rate limit
  const key = `${email}:${event.type}`;
  const last = rateLimitMap.get(key) ?? 0;
  if (Date.now() - last < RATE_LIMIT_MS) {
    return res.status(429).json({ error: "Rate limited" });
  }
  rateLimitMap.set(key, Date.now());

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "BTC Health Monitor <onboarding@resend.dev>",
      to: [email],
      subject: formatSubject(event),
      html: formatHtml(event),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Email send error:", e);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
