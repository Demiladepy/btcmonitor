import { NextResponse } from "next/server";
import { getPrivyClient } from "@/lib/privy-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const privy = getPrivyClient();
    const wallet = await privy.wallets().create({
      chain_type: "starknet",
    });

    return NextResponse.json({
      wallet: {
        id: wallet.id,
        address: wallet.address,
        publicKey: wallet.public_key,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Wallet creation error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
