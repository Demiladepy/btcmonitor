import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    network: process.env.NEXT_PUBLIC_STARKNET_NETWORK ?? "mainnet",
    hasPrivy: Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID),
    hasPrivyServer: Boolean(process.env.PRIVY_APP_SECRET),
    hasPaymaster: Boolean(
      process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY ?? process.env.NEXT_PUBLIC_PAYMASTER_API_KEY,
    ),
    hasMonitor: Boolean(process.env.MONITOR_PRIVATE_KEY),
    hasTelegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    hasEmail: Boolean(process.env.RESEND_API_KEY),
    timestamp: new Date().toISOString(),
  });
}
