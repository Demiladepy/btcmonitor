import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserDefaults, getWalletIdFromRequestHeaders } from "@/lib/alerts-server";

export const dynamic = "force-dynamic";

function toNum(d: Prisma.Decimal | null | undefined): number | null {
  if (!d) return null;
  return d.toNumber();
}

function isValidEmail(s: string | null | undefined): boolean {
  if (s == null || s === "") return true;
  const t = s.trim();
  if (t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export async function GET(req: Request) {
  try {
    const walletId = getWalletIdFromRequestHeaders(req.headers);
    const { user, alertPreferences } = await ensureUserDefaults(walletId);
    if (!user || !alertPreferences) throw new Error("Preferences not found");

    const monitoredPairs = await prisma.monitoredPair.findMany({
      where: { userId: walletId },
      select: { collateralSymbol: true, debtSymbol: true },
    });

    return NextResponse.json({
      alertPreferences: {
        warningThreshold: toNum(alertPreferences.warningThreshold),
        dangerThreshold: toNum(alertPreferences.dangerThreshold),
        criticalThreshold: toNum(alertPreferences.criticalThreshold),
        liquidationDistancePct: alertPreferences.liquidationDistancePct,
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
      monitoredPairs,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load" },
      { status: 500 },
    );
  }
}

async function handleUpdate(req: Request) {
  const walletId = getWalletIdFromRequestHeaders(req.headers);
  await ensureUserDefaults(walletId);

  const body = (await req.json().catch(() => ({}))) as {
    warningThreshold?: number;
    dangerThreshold?: number;
    criticalThreshold?: number;
    liquidationDistancePct?: number;
    emailEnabled?: boolean;
    telegramEnabled?: boolean;
    cooldownMinutes?: number;
    autoProtectEnabled?: boolean;
    notifyContactEmail?: string | null;
    notifyPositions?: boolean;
    notifyYield?: boolean;
    notifyLiquidation?: boolean;
    notifyMarket?: boolean;
    monitoredPairs?: Array<{ collateralSymbol: string; debtSymbol: string }>;
  };

  if (
    body.notifyContactEmail !== undefined &&
    body.notifyContactEmail !== null &&
    !isValidEmail(body.notifyContactEmail)
  ) {
    return NextResponse.json({ error: "Invalid notify email address" }, { status: 400 });
  }

  const warningThreshold = body.warningThreshold ?? 1.5;
  const dangerThreshold = body.dangerThreshold ?? 1.2;
  const criticalThreshold = body.criticalThreshold ?? 1.05;
  const liquidationDistancePct = body.liquidationDistancePct ?? 15.0;

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
      liquidationDistancePct,
      emailEnabled: body.emailEnabled ?? true,
      telegramEnabled: body.telegramEnabled ?? false,
      cooldownMinutes: body.cooldownMinutes ?? 15,
      autoProtectEnabled: body.autoProtectEnabled ?? false,
      ...(notifyContactEmailNormalized !== undefined
        ? { notifyContactEmail: notifyContactEmailNormalized }
        : {}),
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
      liquidationDistancePct,
      emailEnabled: body.emailEnabled ?? true,
      telegramEnabled: body.telegramEnabled ?? false,
      cooldownMinutes: body.cooldownMinutes ?? 15,
      autoProtectEnabled: body.autoProtectEnabled ?? false,
      notifyContactEmail: notifyContactEmailNormalized ?? null,
      notifyPositions: body.notifyPositions ?? true,
      notifyYield: body.notifyYield ?? false,
      notifyLiquidation: body.notifyLiquidation ?? true,
      notifyMarket: body.notifyMarket ?? false,
    },
  });

  // Update monitored pairs if provided
  if (body.monitoredPairs !== undefined && Array.isArray(body.monitoredPairs)) {
    await prisma.monitoredPair.deleteMany({ where: { userId: walletId } });
    if (body.monitoredPairs.length > 0) {
      await prisma.monitoredPair.createMany({
        data: body.monitoredPairs.map((p) => ({
          userId: walletId,
          collateralSymbol: p.collateralSymbol,
          debtSymbol: p.debtSymbol,
        })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({
    alertPreferences: {
      warningThreshold: updated.warningThreshold.toNumber(),
      dangerThreshold: updated.dangerThreshold.toNumber(),
      criticalThreshold: updated.criticalThreshold.toNumber(),
      liquidationDistancePct: updated.liquidationDistancePct,
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
}

export async function PUT(req: Request) {
  try {
    return await handleUpdate(req);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return PUT(req);
}
