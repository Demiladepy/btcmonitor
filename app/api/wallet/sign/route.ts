import { NextResponse } from "next/server";
import { getPrivyClient } from "@/lib/privy-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { walletId, hash } = await req.json();

    if (!walletId || !hash) {
      return NextResponse.json({ error: "walletId and hash required" }, { status: 400 });
    }

    const privy = getPrivyClient();
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
