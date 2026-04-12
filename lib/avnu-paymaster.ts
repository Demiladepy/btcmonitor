/**
 * AVNU sponsored-transaction paymaster config for StarkZap.
 * Supports multiple env names so local `.env` matches AVNU docs and health checks stay accurate.
 */
const DEFAULT_PAYMASTER_URL = "https://starknet.paymaster.avnu.fi";

export function getAvnuPaymasterApiKey(): string | undefined {
  const key =
    process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_PAYMASTER_API_KEY?.trim() ||
    process.env.AVNU_API_KEY?.trim();
  return key || undefined;
}

export function getAvnuPaymasterUrl(): string {
  return process.env.NEXT_PUBLIC_AVNU_PAYMASTER_URL?.trim() || DEFAULT_PAYMASTER_URL;
}

/** Full paymaster object for `new StarkZap({ paymaster })`, or `undefined` if no API key. */
export function getAvnuPaymasterConfig():
  | { nodeUrl: string; headers: { "x-paymaster-api-key": string } }
  | undefined {
  const key = getAvnuPaymasterApiKey();
  if (!key) return undefined;
  return { nodeUrl: getAvnuPaymasterUrl(), headers: { "x-paymaster-api-key": key } };
}
