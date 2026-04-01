import { PrivyClient } from "@privy-io/node";

let cached: PrivyClient | null = null;

/** Lazy init so `next build` never runs Privy without env (Vercel build has no secrets). */
export function getPrivyClient(): PrivyClient {
  if (cached) return cached;
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId?.trim() || !appSecret?.trim()) {
    throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET must be configured");
  }
  cached = new PrivyClient({ appId, appSecret });
  return cached;
}
