/**
 * Dashboard data sources — override via env in `.env` / Vercel (no literals scattered in UI).
 *
 * `NEXT_PUBLIC_VESU_POSITION_PAIRS` — comma-separated collateral/debt pairs, e.g. `WBTC/USDC,ETH/USDC`
 * `NEXT_PUBLIC_DASHBOARD_BALANCE_SYMBOLS` — comma-separated token symbols to show, e.g. `ETH,STRK,USDC,WBTC`
 */

export interface VesuPairConfig {
  collateral: string;
  debt: string;
}

const DEFAULT_VESU_PAIRS = "WBTC/USDC,ETH/USDC";
const DEFAULT_BALANCE_SYMBOLS = "ETH,STRK,USDC,WBTC";

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
