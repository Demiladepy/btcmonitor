import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserDefaults, getWalletIdFromRequestHeaders } from "@/lib/alerts-server";

export const dynamic = "force-dynamic";

function toNumberMaybe(d: Prisma.Decimal | null | undefined): number | null {
  if (!d) return null;
  // Prisma Decimal has toNumber().
  return d.toNumber();
}

export async function GET(req: Request) {
  try {
    const walletId = getWalletIdFromRequestHeaders(req.headers);
    const { user, alertPreferences } = await ensureUserDefaults(walletId);
    if (!user || !alertPreferences) throw new Error("Alert preferences not found.");

    return NextResponse.json({
      alertPreferences: {
        warningThreshold: toNumberMaybe(alertPreferences.warningThreshold),
        dangerThreshold: toNumberMaybe(alertPreferences.dangerThreshold),
        criticalThreshold: toNumberMaybe(alertPreferences.criticalThreshold),
        emailEnabled: alertPreferences.emailEnabled,
        telegramEnabled: alertPreferences.telegramEnabled,
        cooldownMinutes: alertPreferences.cooldownMinutes,
      },
      user: {
        email: user.email,
        telegramChatId: user.telegramChatId,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load preferences" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const walletId = getWalletIdFromRequestHeaders(req.headers);
    await ensureUserDefaults(walletId);

    const body = (await req.json().catch(() => ({}))) as {
      warningThreshold?: number;
      dangerThreshold?: number;
      criticalThreshold?: number;
      emailEnabled?: boolean;
      telegramEnabled?: boolean;
      cooldownMinutes?: number;
    };

    const warningThreshold = body.warningThreshold ?? 1.5;
    const dangerThreshold = body.dangerThreshold ?? 1.2;
    const criticalThreshold = body.criticalThreshold ?? 1.05;

    const updated = await prisma.alertPreferences.upsert({
      where: { userId: walletId },
      update: {
        warningThreshold: new Prisma.Decimal(warningThreshold),
        dangerThreshold: new Prisma.Decimal(dangerThreshold),
        criticalThreshold: new Prisma.Decimal(criticalThreshold),
        emailEnabled: body.emailEnabled ?? true,
        telegramEnabled: body.telegramEnabled ?? false,
        cooldownMinutes: body.cooldownMinutes ?? 15,
      },
      create: {
        userId: walletId,
        warningThreshold: new Prisma.Decimal(warningThreshold),
        dangerThreshold: new Prisma.Decimal(dangerThreshold),
        criticalThreshold: new Prisma.Decimal(criticalThreshold),
        emailEnabled: body.emailEnabled ?? true,
        telegramEnabled: body.telegramEnabled ?? false,
        cooldownMinutes: body.cooldownMinutes ?? 15,
      },
    });

    return NextResponse.json({
      alertPreferences: {
        warningThreshold: updated.warningThreshold.toNumber(),
        dangerThreshold: updated.dangerThreshold.toNumber(),
        criticalThreshold: updated.criticalThreshold.toNumber(),
        emailEnabled: updated.emailEnabled,
        telegramEnabled: updated.telegramEnabled,
        cooldownMinutes: updated.cooldownMinutes,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save preferences" }, { status: 500 });
  }
}

// Allow POST too (the UI spec says POST, while the route spec says PUT).
export async function POST(req: Request) {
  return PUT(req);
}

