import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

export async function POST(req: Request) {
  try {
    const wallet = await privy.wallets().create({
      chain_type: "starknet",
      // No user_id = server-managed wallet (simpler, no JWT needed)
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
