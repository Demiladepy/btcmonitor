import { useState, useCallback } from "react";
import { StarkSigner, ArgentPreset } from "starkzap";
import type { Wallet } from "starkzap";
import { sdk } from "../lib/sdk";

const KEY_STORAGE = "btch_demo_key";

function getOrCreateSessionKey(): string {
  let key = localStorage.getItem(KEY_STORAGE);
  if (!key) {
    const bytes = crypto.getRandomValues(new Uint8Array(31));
    key = "0x00" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(KEY_STORAGE, key);
  }
  return key;
}

function clearSessionKey() {
  localStorage.removeItem(KEY_STORAGE);
}

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
      const privKey = getOrCreateSessionKey();
      console.log("[BTC Health] Connecting to Sepolia…");
      const signer = new StarkSigner(privKey);
      const w = await sdk.connectWallet({
        account: { signer, accountClass: ArgentPreset },
      });
      console.log("[BTC Health] Wallet:", w.address);
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
    clearSessionKey();
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
