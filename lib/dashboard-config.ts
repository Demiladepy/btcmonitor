/**
 * Dashboard data sources — override via env in `.env` / Vercel (no literals scattered in UI).
 *
 * `NEXT_PUBLIC_VESU_POSITION_PAIRS` — comma-separated collateral/debt pairs, e.g. `WBTC/USDC,ETH/USDC`
 * `NEXT_PUBLIC_DASHBOARD_BALANCE_SYMBOLS` — comma-separated token symbols to show
 */

export interface VesuPairConfig {
  collateral: string;
  debt: string;
}

// All mainnet BTC/ETH pairs supported by Vesu
const DEFAULT_VESU_PAIRS = "WBTC/USDC,WBTC/USDT,LBTC/USDC,TBTC/USDC,ETH/USDC,ETH/USDT";
const DEFAULT_BALANCE_SYMBOLS = "ETH,STRK,USDC,WBTC,LBTC,TBTC";

function parsePairs(raw: string): VesuPairConfig[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      const [collateral, debt] = segment.split("/").map((x) => x.trim());
      if (!collateral || !debt) return null;
      return { collateral, debt };
    })
    .filter((p): p is VesuPairConfig => p !== null);
}

export function getVesuPositionPairs(): VesuPairConfig[] {
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_VESU_POSITION_PAIRS?.trim()
      ? process.env.NEXT_PUBLIC_VESU_POSITION_PAIRS.trim()
      : DEFAULT_VESU_PAIRS;
  return parsePairs(raw);
}

export function getDashboardBalanceSymbols(): string[] {
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_DASHBOARD_BALANCE_SYMBOLS?.trim()
      ? process.env.NEXT_PUBLIC_DASHBOARD_BALANCE_SYMBOLS.trim()
      : DEFAULT_BALANCE_SYMBOLS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Maps token symbol to CoinGecko price ID */
export const COINGECKO_PRICE_IDS: Record<string, string> = {
  WBTC: "bitcoin",
  LBTC: "bitcoin",
  TBTC: "bitcoin",
  ETH: "ethereum",
  STRK: "starknet",
};

/** All BTC-variant symbols — used for filtering Vesu markets */
export const BTC_SYMBOLS = new Set(["WBTC", "LBTC", "TBTC", "SolvBTC"]);
