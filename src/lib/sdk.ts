import { StarkZap } from "starkzap";

// Use Blast public RPC — more reliable than Cartridge's default on Sepolia
export const sdk = new StarkZap({
  rpcUrl: "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
  chainId: "0x534e5f5345504f4c4941", // SN_SEPOLIA
});
