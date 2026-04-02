import { NextResponse } from "next/server";
import { StarkZap, StarkSigner, getPresets } from "starkzap";
import { prisma } from "@/lib/prisma";

async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Telegram send failed: ${r.status} ${t}`);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const update = await req.json();

    const msg = update?.message ?? update?.edited_message;
    const chatId = msg?.chat?.id;
    const text: string | undefined = msg?.text;
    if (!chatId || !text) {
      return NextResponse.json({ ok: true });
    }

    const normalizedText = String(text).trim();

    if (normalizedText.startsWith("/start")) {
      const parts = normalizedText.split(" ");
      const code = parts[1]?.trim();
      if (!code) {
        await sendTelegramMessage(chatId, "Connected! (missing code)");
        return NextResponse.json({ ok: true });
      }

      const link = await prisma.telegramLink.findUnique({ where: { code } });
      if (!link) {
        await sendTelegramMessage(chatId, "Link not found. Please request a new one from the app.");
        return NextResponse.json({ ok: true });
      }
      if (link.expiresAt.getTime() < Date.now()) {
        await sendTelegramMessage(chatId, "Link expired. Please request a new one from the app.");
        return NextResponse.json({ ok: true });
      }

      await prisma.$transaction([
        prisma.telegramLink.update({
          where: { code },
          data: {
            chatId: String(chatId),
            usedAt: new Date(),
          },
        }),
        prisma.user.update({
          where: { id: link.userId },
          data: {
            telegramChatId: String(chatId),
            monitoringEnabled: true,
          },
        }),
        prisma.alertPreferences.update({
          where: { userId: link.userId },
          data: { telegramEnabled: true },
        }),
      ]);

      await sendTelegramMessage(chatId, "Connected! You’ll receive alerts here.");
      return NextResponse.json({ ok: true });
    }

    if (normalizedText.startsWith("/mute")) {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: String(chatId) },
      });

      if (!user) {
        await sendTelegramMessage(chatId, "Not connected yet. Use /start from the app first.");
        return NextResponse.json({ ok: true });
      }

      const until = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: { monitoringEnabled: false, mutedUntil: until },
      });

      await sendTelegramMessage(chatId, "Muted for 60 minutes.");
      return NextResponse.json({ ok: true });
    }

    if (normalizedText.startsWith("/status")) {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: String(chatId) },
        include: { alertPreferences: true, monitoredPairs: true },
      });

      if (!user || !user.walletAddress) {
        await sendTelegramMessage(chatId, "Not connected. Use /start from the app first.");
        return NextResponse.json({ ok: true });
      }
      if (!user.alertPreferences) {
        await sendTelegramMessage(chatId, "Preferences not set yet. Update thresholds in the app.");
        return NextResponse.json({ ok: true });
      }

      const monitorKey = process.env.MONITOR_PRIVATE_KEY;
      if (!monitorKey) throw new Error("MONITOR_PRIVATE_KEY not configured");

      const sdk = new StarkZap({ network: "sepolia" });
      const wallet = await sdk.connectWallet({
        account: { signer: new StarkSigner(monitorKey) },
      });

      const tokens = getPresets(wallet.getChainId());

      const warningThreshold = user.alertPreferences.warningThreshold.toNumber();
      const dangerThreshold = user.alertPreferences.dangerThreshold.toNumber();
      const criticalThreshold = user.alertPreferences.criticalThreshold.toNumber();

      const lines: string[] = [];
      for (const pair of user.monitoredPairs) {
        const collateralToken = (tokens as any)[pair.collateralSymbol];
        const debtToken = (tokens as any)[pair.debtSymbol];
        if (!collateralToken || !debtToken) {
          lines.push(`${pair.collateralSymbol}/${pair.debtSymbol}: unsupported on this network`);
          continue;
        }

        const health = await wallet.lending().getHealth({
          collateralToken,
          debtToken,
          user: user.walletAddress as any,
        });

        const colVal = Number(health.collateralValue);
        const dbtVal = Number(health.debtValue);
        if (!Number.isFinite(dbtVal) || dbtVal === 0) {
          lines.push(`${pair.collateralSymbol}/${pair.debtSymbol}: No debt`);
          continue;
        }

        const ratio = colVal / dbtVal;
        const level =
          ratio < criticalThreshold ? "CRITICAL"
          : ratio < dangerThreshold ? "DANGER"
          : ratio < warningThreshold ? "WARNING"
          : "SAFE";

        const hr = ratio === Infinity ? "∞" : ratio.toFixed(3);
        lines.push(`${pair.collateralSymbol}/${pair.debtSymbol}: ${hr} (${level})`);
      }

      const header = `BTC Health Monitor status (Sepolia)\nMuted: ${user.monitoringEnabled ? "No" : "Yes"}`;
      await sendTelegramMessage(chatId, [header, ...lines].join("\n"));
      return NextResponse.json({ ok: true });
    }

    // Default: ignore unknown commands.
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Webhook failed" }, { status: 500 });
  }
}

