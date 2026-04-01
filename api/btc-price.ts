import type { VercelRequest, VercelResponse } from "@vercel/node";

// Cache the price for 60 seconds to avoid hitting Artemis rate limits
let cached: { price: number; tvl: number; ts: number } | null = null;
const CACHE_TTL = 60_000;

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.status(200).json(cached);
  }

  const apiKey = process.env.ARTEMIS_API_KEY;

  // Fallback if Artemis not configured: return null values
  if (!apiKey) {
    return res.status(200).json({ price: null, tvl: null, ts: Date.now() });
  }

  const headers = { "x-api-key": apiKey };
  const BASE = "https://api.artemisanalytics.com/v1";

  try {
    const [priceRes, tvlRes] = await Promise.allSettled([
      fetch(`${BASE}/data/asset?artemisId=bitcoin&metric=price`, { headers }),
      fetch(`${BASE}/data/asset?artemisId=vesu&metric=tvl`, { headers }),
    ]);

    const price =
      priceRes.status === "fulfilled" && priceRes.value.ok
        ? ((await priceRes.value.json()).data?.[0]?.val ?? null)
        : null;

    const tvl =
      tvlRes.status === "fulfilled" && tvlRes.value.ok
        ? ((await tvlRes.value.json()).data?.[0]?.val ?? null)
        : null;

    cached = { price, tvl, ts: Date.now() };
    return res.status(200).json(cached);
  } catch (e) {
    console.error("Artemis fetch error:", e);
    return res.status(200).json({ price: null, tvl: null, ts: Date.now() });
  }
}
