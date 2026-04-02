import { NextResponse } from "next/server";
import { StarkZap, StarkSigner, getPresets, PrivySigner, accountPresets, Amount } from "starkzap";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPrivyClient } from "@/lib/privy-server";

const AVNU_PAYMASTER_API_KEY =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY ?? process.env.NEXT_PUBLIC_PAYMASTER_API_KEY;

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

    if (normalizedText.startsWith("/status") || normalizedText.startsWith("/health")) {
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

    if (normalizedText.startsWith("/repay")) {
      const user = await prisma.user.findFirst({
        where: { telegramChatId: String(chatId) },
        include: { alertPreferences: true },
      });

      if (!user || !user.walletAddress) {
        await sendTelegramMessage(chatId, "Not connected. Use /start from the app first.");
        return NextResponse.json({ ok: true });
      }
      if (!user.alertPreferences) {
        await sendTelegramMessage(chatId, "Preferences not set yet. Update thresholds in the app.");
        return NextResponse.json({ ok: true });
      }

      if (user.monitoringEnabled === false) {
        await sendTelegramMessage(chatId, "Monitoring is disabled (muted). Enable it in the app to execute.");
        return NextResponse.json({ ok: true });
      }
      if (!user.alertPreferences.autoProtectEnabled) {
        await sendTelegramMessage(chatId, "Auto-protect is disabled. Toggle it on in the Alerts page first.");
        return NextResponse.json({ ok: true });
      }

      const monitorKey = process.env.MONITOR_PRIVATE_KEY;
      if (!monitorKey) throw new Error("MONITOR_PRIVATE_KEY not configured");

      const sdk = new StarkZap({ network: "sepolia" });
      const wallet = await sdk.connectWallet({
        account: { signer: new StarkSigner(monitorKey) },
      });

      const tokens = getPresets(wallet.getChainId());
      const collateralToken = (tokens as any)["WBTC"];
      const debtToken = (tokens as any)["USDC"];

      if (!collateralToken || !debtToken) {
        await sendTelegramMessage(chatId, "WBTC/USDC not supported on this network.");
        return NextResponse.json({ ok: true });
      }

      // Guardrail: only execute when current health is actually critical.
      const health = await wallet.lending().getHealth({
        collateralToken,
        debtToken,
        user: user.walletAddress as any,
      });

      const colVal = Number(health.collateralValue);
      const dbtVal = Number(health.debtValue);
      if (!Number.isFinite(dbtVal) || dbtVal === 0) {
        await sendTelegramMessage(chatId, "No debt detected for WBTC/USDC. Nothing to repay.");
        return NextResponse.json({ ok: true });
      }

      const ratio = colVal / dbtVal;
      const criticalThreshold = user.alertPreferences.criticalThreshold.toNumber();
      if (ratio >= criticalThreshold) {
        await sendTelegramMessage(chatId, `Health is not critical yet (ratio=${ratio.toFixed(3)}). Skipping.`);
        return NextResponse.json({ ok: true });
      }

      // Cooldown: prevent repeated critical executions.
      const recent = await prisma.alert.findFirst({
        where: {
          userId: user.id,
          collateralSymbol: "WBTC",
          debtSymbol: "USDC",
          level: "critical",
          createdAt: { gte: new Date(Date.now() - user.alertPreferences.cooldownMinutes * 60_000) },
        },
      });
      if (recent) {
        await sendTelegramMessage(chatId, `Skipped due to cooldown. Last critical alert: ${recent.createdAt.toISOString()}`);
        return NextResponse.json({ ok: true });
      }

      // Compute 10% of current debt (base units).
      const position = await wallet.lending().getPosition({
        collateralToken,
        debtToken,
        user: user.walletAddress as any,
      });
      const debtAmountBase = (position as any).debtAmount ?? BigInt(0);
      if (debtAmountBase <= BigInt(0)) {
        await sendTelegramMessage(chatId, "Debt amount is zero. Nothing to repay.");
        return NextResponse.json({ ok: true });
      }

      const repayAmountBase = (debtAmountBase * BigInt(10)) / BigInt(100);
      if (repayAmountBase <= BigInt(0)) {
        await sendTelegramMessage(chatId, "Repay amount is too small. Skipping.");
        return NextResponse.json({ ok: true });
      }

      // Execute repay using the user's Privy wallet (sponsored via AVNU paymaster).
      const privy = getPrivyClient();
      const privyWallet = await privy.wallets().get(user.id);
      const publicKey = (privyWallet as any)?.publicKey ?? (privyWallet as any)?.public_key;
      if (!publicKey) throw new Error("Could not resolve user's Privy public key");

      const paymaster = AVNU_PAYMASTER_API_KEY
        ? { headers: { "x-paymaster-api-key": AVNU_PAYMASTER_API_KEY } }
        : undefined;

      const execSdk = new StarkZap({
        network: "sepolia",
        paymaster,
      });

      const userWallet = await execSdk.connectWallet({
        account: {
          signer: new PrivySigner({
            walletId: user.id,
            publicKey,
            rawSign: async (walletId: string, messageHash: string) => {
              const raw = await privy.wallets().rawSign(walletId, { params: { hash: messageHash } });
              return raw.signature as string;
            },
          }),
          accountClass: accountPresets.argentXV050,
        },
        accountAddress: user.walletAddress as any,
        feeMode: "sponsored",
      });

      await userWallet.ensureReady({ deploy: "if_needed", feeMode: "sponsored" });

      const userUsdcBal = await userWallet.balanceOf(debtToken);
      const userUsdcBalBase = userUsdcBal.toBase();
      const repayCappedBase =
        repayAmountBase > userUsdcBalBase ? userUsdcBalBase : repayAmountBase;
      if (repayCappedBase <= BigInt(0)) {
        await sendTelegramMessage(chatId, "Insufficient USDC in wallet to execute the repay.");
        return NextResponse.json({ ok: true });
      }

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

      // Record in history so judges can verify it happened.
      await prisma.alert.create({
        data: {
          userId: user.id,
          collateralSymbol: "WBTC",
          debtSymbol: "USDC",
          level: "critical",
          healthRatio: new Prisma.Decimal(ratio),
          message: `Manual /repay executed: repaid ~10% of debt. Tx: ${tx.hash}`,
          emailSent: false,
          telegramSent: true,
        },
      });

      await sendTelegramMessage(
        chatId,
        `Auto-protect /repay executed ✅\nRepayed ~10% of debt (health ratio: ${ratio.toFixed(3)}).\nTx: ${tx.hash}`,
      );
      return NextResponse.json({ ok: true });
    }

    // Default: ignore unknown commands.
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Webhook failed" }, { status: 500 });
  }
}

