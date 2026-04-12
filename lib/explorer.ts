/** Voyager transaction URL for the configured Starknet network. */
export function voyagerTxUrl(txHash: string): string {
  const net = (process.env.NEXT_PUBLIC_STARKNET_NETWORK ?? "mainnet").toLowerCase();
  if (net === "sepolia" || net === "testnet") {
    return `https://sepolia.voyager.online/tx/${txHash}`;
  }
  return `https://voyager.online/tx/${txHash}`;
}
