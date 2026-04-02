import { prisma } from "@/lib/prisma";
import { getPrivyClient } from "@/lib/privy-server";
import { getVesuPositionPairs } from "@/lib/dashboard-config";
import { Prisma } from "@prisma/client";

function extractEmail(linkedAccounts: any[] | null | undefined): string | null {
  const emailAcc = (linkedAccounts ?? []).find(
    (a) => a?.type === "email" && typeof a?.address === "string" && a.address.includes("@"),
  );
  return emailAcc?.address ?? null;
}

export async function ensureUserDefaults(walletId: string) {
  const privy = getPrivyClient();

  const wallet = await privy.wallets().get(walletId);
  const walletAddress = wallet.address;
  const ownerId = (wallet as any).owner_id as string | null | undefined;

  let email: string | null = null;
  if (ownerId) {
    try {
      const user = await (privy as any).users()._get(ownerId);
      email = extractEmail(user?.linked_accounts);
    } catch (err) {
      // Email is optional; telegram alerts can still work.
      console.warn("Failed to fetch Privy email:", err);
    }
  }

  // Create/update base user record.
  await prisma.user.upsert({
    where: { id: walletId },
    update: {
      walletAddress,
      email: email ?? undefined,
    },
    create: {
      id: walletId,
      walletAddress,
      email,
    },
  });

  // Create default preferences if missing.
  await prisma.alertPreferences.upsert({
    where: { userId: walletId },
    create: {
      userId: walletId,
      emailEnabled: true,
      telegramEnabled: false,
      warningThreshold: new Prisma.Decimal(1.5),
      dangerThreshold: new Prisma.Decimal(1.2),
      criticalThreshold: new Prisma.Decimal(1.05),
      cooldownMinutes: 15,
      autoProtectEnabled: false,
      notifyPositions: true,
      notifyYield: false,
      notifyLiquidation: true,
      notifyMarket: false,
    },
    update: {},
  });

  // Ensure monitored pairs exist.
  const pairs = getVesuPositionPairs();
  await Promise.all(
    pairs.map((pair) =>
      prisma.monitoredPair.upsert({
        where: {
          userId_collateralSymbol_debtSymbol: {
            userId: walletId,
            collateralSymbol: pair.collateral,
            debtSymbol: pair.debt,
          },
        },
        create: {
          userId: walletId,
          collateralSymbol: pair.collateral,
          debtSymbol: pair.debt,
        },
        update: {},
      }),
    ),
  );

  const user = await prisma.user.findUnique({ where: { id: walletId } });
  const alertPreferences = await prisma.alertPreferences.findUnique({ where: { userId: walletId } });

  return { user, alertPreferences };
}

export function getWalletIdFromRequestHeaders(headers: Headers): string {
  const walletId = headers.get("x-wallet-id") ?? undefined;
  if (!walletId) {
    throw new Error("Missing x-wallet-id header");
  }
  return walletId;
}

