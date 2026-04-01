import { NextRequest, NextResponse } from "next/server";

/** Server-side JSON-RPC relay so the browser never hits a third-party RPC URL (avoids CORS). */
const DEFAULT_UPSTREAM = "https://api.cartridge.gg/x/starknet/sepolia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starknet.js expects JSON; never return an empty body (avoids "Unexpected end of JSON input"). */
function jsonRpcErrorResponse(message: string, httpStatus: number, id: unknown) {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: { code: -32603, message: `RPC proxy: ${message}` },
      id: id ?? null,
    },
    { status: httpStatus, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST(req: NextRequest) {
  const upstream =
    process.env.STARKNET_SEPOLIA_RPC_URL?.trim() ||
    process.env.STARKNET_RPC_URL?.trim() ||
    DEFAULT_UPSTREAM;

  let id: unknown = null;

  try {
    const body = await req.text();

    try {
      const parsed = JSON.parse(body) as { id?: unknown };
      if ("id" in parsed) id = parsed.id;
    } catch {
      /* non-JSON body — still forward; id stays null */
    }

    const r = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(60_000),
    });

    const text = await r.text();

    if (!text.trim()) {
      console.error("[starknet-rpc] Empty upstream response", upstream, r.status);
      return jsonRpcErrorResponse(`Upstream returned empty body (HTTP ${r.status})`, 502, id);
    }

    try {
      JSON.parse(text);
    } catch {
      console.error("[starknet-rpc] Upstream non-JSON", upstream, r.status, text.slice(0, 200));
      return jsonRpcErrorResponse(`Upstream returned non-JSON (HTTP ${r.status})`, 502, id);
    }

    const contentType = r.headers.get("content-type") || "application/json";

    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": contentType },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[starknet-rpc]", upstream, msg);
    return jsonRpcErrorResponse(msg, 502, id);
  }
}
