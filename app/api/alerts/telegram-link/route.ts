import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureUserDefaults, getWalletIdFromRequestHeaders } from "@/lib/alerts-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const walletId = getWalletIdFromRequestHeaders(req.headers);
    await ensureUserDefaults(walletId);

    const code = crypto.randomBytes(4).toString("hex"); // 8 chars
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Clean up any old unused codes for this user (optional).
    await prisma.telegramLink.create({
      data: {
        code,
        userId: walletId,
        expiresAt,
      },
    });

    return NextResponse.json({ code });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate Telegram link" },
      { status: 500 },
    );
  }
}

