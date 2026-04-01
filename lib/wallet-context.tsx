"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { StarkZap, OnboardStrategy, accountPresets, type WalletInterface } from "starkzap";

interface WalletState {
  wallet: WalletInterface | null;
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<StarkZap | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (!sdkRef.current) {
        sdkRef.current = new StarkZap({ network: "sepolia" });
      }
      const sdk = sdkRef.current;

      const { wallet: w } = await sdk.onboard({
        strategy: OnboardStrategy.Privy,
        privy: {
          resolve: async () => {
            const res = await fetch("/api/wallet/starknet", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            });
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              wallet?: { id: string; publicKey: string };
            };
            if (!res.ok) {
              throw new Error(
                data.error || `Wallet API failed (${res.status}). Check server logs and PRIVY_APP_ID / PRIVY_APP_SECRET.`,
              );
            }
            if (!data.wallet?.id || !data.wallet?.publicKey) {
              throw new Error("Wallet API returned an invalid payload (missing id or publicKey).");
            }
            return {
              walletId: data.wallet.id,
              publicKey: data.wallet.publicKey,
              serverUrl: `${window.location.origin}/api/wallet/sign`,
            };
          },
        },
        accountPreset: accountPresets.argentXV050,
        deploy: "if_needed",
        feeMode: "user_pays",
      });

      setWallet(w);
      setAddress(w.address.toString());
    } catch (err: unknown) {
      console.error("Connect failed:", err);
      const message = err instanceof Error ? err.message : "Connection failed";
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAddress(null);
    sdkRef.current = null;
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, address, isConnecting, error, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be inside WalletProvider");
  return ctx;
}
