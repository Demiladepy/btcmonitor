import { NextResponse } from "next/server";

const AVNU_PAYMASTER_URL =
  process.env.AVNU_PAYMASTER_URL || "https://sepolia.paymaster.avnu.fi/v1";
/** Only forward if non-empty after trim — whitespace-only env values caused "invalid" key errors. */
const AVNU_API_KEY = process.env.AVNU_API_KEY?.trim();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const response = await fetch(AVNU_PAYMASTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AVNU_API_KEY ? { "x-paymaster-api-key": AVNU_API_KEY } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
