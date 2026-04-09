import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureUserDefaults, getWalletIdFromRequestHeaders } from "@/lib/alerts-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const walletId = getWalletIdFromRequestHeaders(req.headers);
    await ensureUserDefaults(walletId);

    const alerts = await prisma.alert.findMany({
      where: { userId: walletId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      alerts: alerts.map((a) => ({
        id: a.id,
        createdAt: a.createdAt.toISOString(),
        position: `${a.collateralSymbol}/${a.debtSymbol}`,
        collateralSymbol: a.collateralSymbol,
        debtSymbol: a.debtSymbol,
        level: a.level,
        healthRatio: a.healthRatio.toNumber(),
        liquidationPrice: a.liquidationPrice ?? null,
        currentPrice: a.currentPrice ?? null,
        distancePct: a.distancePct ?? null,
        emailSent: a.emailSent,
        telegramSent: a.telegramSent,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load history" },
      { status: 500 },
    );
  }
}
