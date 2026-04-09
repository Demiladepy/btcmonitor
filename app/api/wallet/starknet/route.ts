import { NextResponse } from "next/server";
import { getPrivyClient } from "@/lib/privy-server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      existingWalletId?: string;
      // Email passed by the client after Privy login, used for cross-device wallet recovery
      email?: string;
    };
    const { existingWalletId, email: clientEmail } = body;
    const privy = getPrivyClient();

    // ── Authenticated flow (Privy email login) ─────────────────────────────────
    // The client sends a Privy access token in the Authorization header after the user
    // has verified their email via the Privy modal. We verify this token server-side
    // to confirm identity before allowing wallet access or creation.
    const authHeader = req.headers.get("authorization");
    const privyToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (privyToken) {
      // Verify the Privy access token — confirms the caller is an authenticated Privy user
      let privyUserId: string;
      try {
        const claims = await privy.utils().auth().verifyAccessToken(privyToken);
        privyUserId = claims.user_id;
      } catch {
        return NextResponse.json(
          { error: "Invalid or expired authentication token. Please sign in again." },
          { status: 401 },
        );
      }

      // If a wallet ID is already cached locally, verify it still exists and return it
      if (existingWalletId) {
        try {
          const existingWallet = await privy.wallets().get(existingWalletId);
          if (existingWallet) {
            const publicKey =
              (existingWallet as any)?.publicKey ?? (existingWallet as any)?.public_key;
            return NextResponse.json({
              wallet: {
                id: existingWallet.id,
                address: existingWallet.address,
                publicKey,
              },
            });
          }
        } catch {
          // Wallet no longer exists in Privy — fall through to email-based recovery
        }
      }

      // ── Cross-device recovery via email ────────────────────────────────────
      // The client passes the user's email (from usePrivy().user.email.address).
      // We look up our DB to find if this email already has an associated server wallet.
      // This means logging in on a new device with the same email restores the wallet.
      const email = clientEmail?.trim().toLowerCase() || null;
      if (email) {
        const dbUser = await prisma.user.findUnique({ where: { email } }).catch(() => null);
        if (dbUser?.privyWalletId) {
          try {
            const recoveredWallet = await privy.wallets().get(dbUser.privyWalletId);
            const publicKey =
              (recoveredWallet as any)?.publicKey ?? (recoveredWallet as any)?.public_key;
            return NextResponse.json({
              wallet: {
                id: recoveredWallet.id,
                address: recoveredWallet.address,
                publicKey,
              },
            });
          } catch {
            // Wallet gone from Privy — create a fresh one below
          }
        }
      }

      // ── Create a new server wallet for this authenticated user ─────────────
      const newWallet = await privy.wallets().create({ chain_type: "starknet" });
      const publicKey = (newWallet as any)?.publicKey ?? (newWallet as any)?.public_key;
      return NextResponse.json({
        wallet: {
          id: newWallet.id,
          address: newWallet.address,
          publicKey,
        },
      });
    }

    // ── Unauthenticated legacy / reconnect flow ────────────────────────────────
    // Supports returning users who still have a valid existingWalletId in localStorage
    // from before the auth system was added. No new wallets can be created without auth.
    if (existingWalletId) {
      const wallet = await privy.wallets().get(existingWalletId);
      const publicKey = (wallet as any)?.publicKey ?? (wallet as any)?.public_key;
      return NextResponse.json({
        wallet: { id: wallet.id, address: wallet.address, publicKey },
      });
    }

    // No token and no existing wallet ID — require authentication
    return NextResponse.json(
      { error: "Authentication required. Please sign in with your email." },
      { status: 401 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Wallet API error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
