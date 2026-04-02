import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserDefaults, getWalletIdFromRequestHeaders } from "@/lib/alerts-server";

export const dynamic = "force-dynamic";

function toNumberMaybe(d: Prisma.Decimal | null | undefined): number | null {
  if (!d) return null;
  return d.toNumber();
}

function isValidOptionalEmail(s: string | null | undefined): boolean {
  if (s == null || s === "") return true;
  const t = s.trim();
  if (t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
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
        autoProtectEnabled: alertPreferences.autoProtectEnabled,
        notifyContactEmail: alertPreferences.notifyContactEmail,
        notifyPositions: alertPreferences.notifyPositions,
        notifyYield: alertPreferences.notifyYield,
        notifyLiquidation: alertPreferences.notifyLiquidation,
        notifyMarket: alertPreferences.notifyMarket,
        lastMarketDigestAt: alertPreferences.lastMarketDigestAt?.toISOString() ?? null,
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
      autoProtectEnabled?: boolean;
      notifyContactEmail?: string | null;
      notifyPositions?: boolean;
      notifyYield?: boolean;
      notifyLiquidation?: boolean;
      notifyMarket?: boolean;
    };

    if (body.notifyContactEmail !== undefined && body.notifyContactEmail !== null && !isValidOptionalEmail(body.notifyContactEmail)) {
      return NextResponse.json({ error: "Invalid notify email address" }, { status: 400 });
    }

    const warningThreshold = body.warningThreshold ?? 1.5;
    const dangerThreshold = body.dangerThreshold ?? 1.2;
    const criticalThreshold = body.criticalThreshold ?? 1.05;
    const autoProtectEnabled = body.autoProtectEnabled ?? false;

    const notifyContactEmailNormalized =
      body.notifyContactEmail === undefined
        ? undefined
        : body.notifyContactEmail === null || body.notifyContactEmail === ""
          ? null
          : body.notifyContactEmail.trim();

    const updated = await prisma.alertPreferences.upsert({
      where: { userId: walletId },
      update: {
        warningThreshold: new Prisma.Decimal(warningThreshold),
        dangerThreshold: new Prisma.Decimal(dangerThreshold),
        criticalThreshold: new Prisma.Decimal(criticalThreshold),
        emailEnabled: body.emailEnabled ?? true,
        telegramEnabled: body.telegramEnabled ?? false,
        cooldownMinutes: body.cooldownMinutes ?? 15,
        autoProtectEnabled,
        ...(notifyContactEmailNormalized !== undefined ? { notifyContactEmail: notifyContactEmailNormalized } : {}),
        ...(body.notifyPositions !== undefined ? { notifyPositions: body.notifyPositions } : {}),
        ...(body.notifyYield !== undefined ? { notifyYield: body.notifyYield } : {}),
        ...(body.notifyLiquidation !== undefined ? { notifyLiquidation: body.notifyLiquidation } : {}),
        ...(body.notifyMarket !== undefined ? { notifyMarket: body.notifyMarket } : {}),
      },
      create: {
        userId: walletId,
        warningThreshold: new Prisma.Decimal(warningThreshold),
        dangerThreshold: new Prisma.Decimal(dangerThreshold),
        criticalThreshold: new Prisma.Decimal(criticalThreshold),
        emailEnabled: body.emailEnabled ?? true,
        telegramEnabled: body.telegramEnabled ?? false,
        cooldownMinutes: body.cooldownMinutes ?? 15,
        autoProtectEnabled,
        notifyContactEmail: notifyContactEmailNormalized ?? null,
        notifyPositions: body.notifyPositions ?? true,
        notifyYield: body.notifyYield ?? false,
        notifyLiquidation: body.notifyLiquidation ?? true,
        notifyMarket: body.notifyMarket ?? false,
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
        autoProtectEnabled: updated.autoProtectEnabled,
        notifyContactEmail: updated.notifyContactEmail,
        notifyPositions: updated.notifyPositions,
        notifyYield: updated.notifyYield,
        notifyLiquidation: updated.notifyLiquidation,
        notifyMarket: updated.notifyMarket,
        lastMarketDigestAt: updated.lastMarketDigestAt?.toISOString() ?? null,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save preferences" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return PUT(req);
}
