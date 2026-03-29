import { useState, useCallback } from "react";
import { StarkSigner, ArgentPreset } from "starkzap";
import type { Wallet } from "starkzap";
import { sdk } from "../lib/sdk";

// Demo private key — valid on Stark curve (248-bit, always < n)
const DEMO_PRIVATE_KEY =
  "0x00c1e9550e66958296d11b60f8e8e7a7ad990d07fa65d5f7652c4a6c87d4e3cc";

export interface WalletState {
  wallet: Wallet | null;
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: Error | null;
}

export function useWallet(): WalletState {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      console.log("[BTC Health] Connecting demo wallet on Sepolia…");
      const signer = new StarkSigner(DEMO_PRIVATE_KEY);
      const w = await sdk.connectWallet({
        account: { signer, accountClass: ArgentPreset },
      });
      console.log("[BTC Health] Connected:", w.address);
      setWallet(w);
    } catch (e) {
      console.error("[BTC Health] Connect failed:", e);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setError(null);
  }, []);

  return {
    wallet,
    address: wallet?.address ?? null,
    isConnected: !!wallet,
    isConnecting,
    connect,
    disconnect,
    error,
  };
}
