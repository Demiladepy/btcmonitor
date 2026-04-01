import type { ChainId } from "starkzap";

/** Human-readable network label from StarkZap `ChainId` (no hardcoded badge strings in pages). */
export function chainDisplayLabel(chainId: ChainId): string {
  if (chainId.isSepolia()) return "Sepolia";
  if (chainId.isMainnet()) return "Mainnet";
  return chainId.toLiteral();
}
