import { sepoliaTokens } from "starkzap";
import type { Token } from "starkzap";

export type { Token };
export { sepoliaTokens };

// Default pair: ETH as collateral, USDC as debt
// After running getMarkets() and confirming available pools on Sepolia,
// you can swap COLLATERAL_TOKEN to a BTC variant if listed.
export const COLLATERAL_TOKEN: Token = sepoliaTokens.ETH;
export const DEBT_TOKEN: Token = sepoliaTokens.USDC;

export function formatTokenAmount(amount: bigint, decimals: number, displayDecimals = 4): string {
  if (amount === 0n) return "0";
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  if (remainder === 0n) return whole.toString();
  const fracStr = remainder.toString().padStart(decimals, "0").slice(0, displayDecimals);
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

export function formatUSD(valueWei: bigint): string {
  const dollars = Number(valueWei) / 1e18;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
