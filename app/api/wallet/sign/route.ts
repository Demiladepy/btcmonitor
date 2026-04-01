import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

const privy = new PrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

export async function POST(req: Request) {
  try {
    const { walletId, hash } = await req.json();

    if (!walletId || !hash) {
      return NextResponse.json({ error: "walletId and hash required" }, { status: 400 });
    }

    const result = await privy.wallets().rawSign(walletId, {
      params: { hash },
    });

    return NextResponse.json({ signature: result.signature });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sign error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
