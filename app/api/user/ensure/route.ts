import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVesuPositionPairs } from "@/lib/dashboard-config";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Creates or updates a user record for Cartridge / external wallet users.
 * Privy users are handled by /api/wallet/starknet + ensureUserDefaults.
 *
 * Body: { walletAddress: string, connectionMethod: "cartridge" | "external" }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      walletAddress?: string;
      connectionMethod?: string;
    };

    const walletAddress = body.walletAddress?.trim();
    if (!walletAddress || !walletAddress.startsWith("0x")) {
      return NextResponse.json({ error: "Invalid walletAddress" }, { status: 400 });
    }

    const connectionMethod = body.connectionMethod ?? "external";

    // Upsert user — id = wallet address for non-Privy users
    await prisma.user.upsert({
      where: { id: walletAddress },
      update: { walletAddress, connectionMethod },
      create: {
        id: walletAddress,
        walletAddress,
        connectionMethod,
      },
    });

    // Ensure default alert preferences
    await prisma.alertPreferences.upsert({
      where: { userId: walletAddress },
      create: {
        userId: walletAddress,
        emailEnabled: true,
        telegramEnabled: false,
        warningThreshold: new Prisma.Decimal(1.5),
        dangerThreshold: new Prisma.Decimal(1.2),
        criticalThreshold: new Prisma.Decimal(1.05),
        liquidationDistancePct: 15.0,
        cooldownMinutes: 15,
        autoProtectEnabled: false,
        notifyPositions: true,
        notifyYield: false,
        notifyLiquidation: true,
        notifyMarket: false,
      },
      update: {},
    });

    // Ensure monitored pairs exist
    const pairs = getVesuPositionPairs();
    await Promise.all(
      pairs.map((pair) =>
        prisma.monitoredPair.upsert({
          where: {
            userId_collateralSymbol_debtSymbol: {
              userId: walletAddress,
              collateralSymbol: pair.collateral,
              debtSymbol: pair.debt,
            },
          },
          create: {
            userId: walletAddress,
            collateralSymbol: pair.collateral,
            debtSymbol: pair.debt,
          },
          update: {},
        }),
      ),
    );

    return NextResponse.json({ ok: true, walletAddress, connectionMethod });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("user/ensure error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
