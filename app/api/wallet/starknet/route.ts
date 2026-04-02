import { NextResponse } from "next/server";
import { getPrivyClient } from "@/lib/privy-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { existingWalletId?: string };
    const existingWalletId = body?.existingWalletId;
    const privy = getPrivyClient();

    // Create once per user, then reuse on refresh by walletId.
    const wallet = existingWalletId
      ? await privy.wallets().get(existingWalletId)
      : await privy.wallets().create({ chain_type: "starknet" });

    const publicKey =
      // Privy SDK uses snake_case, but we normalize so the frontend is consistent.
      (wallet as any)?.publicKey ?? (wallet as any)?.public_key;

    return NextResponse.json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        publicKey,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Wallet creation error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
