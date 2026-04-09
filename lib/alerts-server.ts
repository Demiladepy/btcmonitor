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

/** Returns true if the value looks like a Starknet wallet address (0x + hex). */
function isStarknetAddress(value: string): boolean {
  return value.startsWith("0x") && value.length > 20;
}

async function ensurePrefsAndPairs(userId: string): Promise<void> {
  await prisma.alertPreferences.upsert({
    where: { userId },
    create: {
      userId,
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

  const pairs = getVesuPositionPairs();
  await Promise.all(
    pairs.map((pair) =>
      prisma.monitoredPair.upsert({
        where: {
          userId_collateralSymbol_debtSymbol: {
            userId,
            collateralSymbol: pair.collateral,
            debtSymbol: pair.debt,
          },
        },
        create: {
          userId,
          collateralSymbol: pair.collateral,
          debtSymbol: pair.debt,
        },
        update: {},
      }),
    ),
  );
}

/**
 * Ensures a user record, alert preferences, and monitored pairs exist.
 *
 * Supports two ID formats:
 * - Privy wallet ID (e.g. "clxxxxxxxx"): fetches wallet address + email from Privy API
 * - Starknet wallet address (starts with "0x"): used as-is (Cartridge / external wallets)
 */
export async function ensureUserDefaults(walletId: string) {
  if (isStarknetAddress(walletId)) {
    // Cartridge or external wallet — walletId IS the wallet address
    await prisma.user.upsert({
      where: { id: walletId },
      update: { walletAddress: walletId },
      create: {
        id: walletId,
        walletAddress: walletId,
        connectionMethod: "external",
      },
    });

    await ensurePrefsAndPairs(walletId);

    const user = await prisma.user.findUnique({ where: { id: walletId } });
    const alertPreferences = await prisma.alertPreferences.findUnique({ where: { userId: walletId } });
    return { user, alertPreferences };
  }

  // Privy flow — walletId is the Privy wallet ID
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
      console.warn("Failed to fetch Privy email:", err);
    }
  }

  await prisma.user.upsert({
    where: { id: walletId },
    update: {
      walletAddress,
      privyWalletId: walletId,
      connectionMethod: "privy",
      email: email ?? undefined,
    },
    create: {
      id: walletId,
      walletAddress,
      privyWalletId: walletId,
      connectionMethod: "privy",
      email,
    },
  });

  await ensurePrefsAndPairs(walletId);

  const user = await prisma.user.findUnique({ where: { id: walletId } });
  const alertPreferences = await prisma.alertPreferences.findUnique({ where: { userId: walletId } });
  return { user, alertPreferences };
}

/**
 * Extracts the wallet identifier from request headers.
 * For Privy users: returns the Privy wallet ID.
 * For Cartridge/external users: returns the wallet address (starts with "0x").
 */
export function getWalletIdFromRequestHeaders(headers: Headers): string {
  const walletId = headers.get("x-wallet-id") ?? undefined;
  if (!walletId) {
    throw new Error("Missing x-wallet-id header");
  }
  return walletId;
}
