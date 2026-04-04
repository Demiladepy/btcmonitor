import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWalletIdFromRequestHeaders } from "@/lib/alerts-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const walletId = getWalletIdFromRequestHeaders(req.headers);
    const user = await prisma.user.findUnique({
      where: { id: walletId },
      select: { telegramChatId: true },
    });
    return NextResponse.json({ connected: Boolean(user?.telegramChatId) });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check Telegram status" },
      { status: 500 },
    );
  }
}
