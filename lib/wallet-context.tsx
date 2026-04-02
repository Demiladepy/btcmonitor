"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { StarkZap, OnboardStrategy, accountPresets, ChainId, type WalletInterface, AvnuSwapProvider } from "starkzap";

const WALLET_ID_STORAGE_KEY = "btcmonitor_wallet_id";
const WALLET_ADDRESS_STORAGE_KEY = "btcmonitor_wallet_address";
// Required for Starknet "sponsored" (gasless) transactions via AVNU paymaster.
// This is intentionally `NEXT_PUBLIC_` because wallet onboarding happens in the browser.
const AVNU_PAYMASTER_API_KEY =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY ?? process.env.NEXT_PUBLIC_PAYMASTER_API_KEY;

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

    const storedWalletId = localStorage.getItem(WALLET_ID_STORAGE_KEY);

    const connectOnce = async (existingWalletId?: string | null) => {
      if (!sdkRef.current) {
        // Same-origin API route proxies to upstream RPC (browser cannot call most public RPCs — CORS).
        const paymaster =
          AVNU_PAYMASTER_API_KEY
            ? {
                // AVNU paymaster expects this header.
                headers: { "x-paymaster-api-key": AVNU_PAYMASTER_API_KEY },
              }
            : undefined;

        sdkRef.current = new StarkZap({
          rpcUrl: `${window.location.origin}/api/starknet-rpc`,
          chainId: ChainId.SEPOLIA,
          paymaster,
        });
      }

      const sdk = sdkRef.current;

      const body = existingWalletId ? JSON.stringify({ existingWalletId }) : JSON.stringify({});
      const res = await fetch("/api/wallet/starknet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        wallet?: { id: string; publicKey: string; address: string };
      };

      if (!res.ok) {
        throw new Error(data.error || `Wallet API failed (${res.status}).`);
      }
      if (!data.wallet?.id || !data.wallet?.publicKey || !data.wallet?.address) {
        throw new Error("Wallet API returned an invalid payload.");
      }

      const walletId = data.wallet.id;
      const publicKey = data.wallet.publicKey;
      const walletAddress = data.wallet.address;

      // Persist for next time (refresh / navigation).
      localStorage.setItem(WALLET_ID_STORAGE_KEY, walletId);
      localStorage.setItem(WALLET_ADDRESS_STORAGE_KEY, walletAddress);

      const { wallet: w } = await sdk.onboard({
        strategy: OnboardStrategy.Privy,
        privy: {
          resolve: async () => ({
            walletId,
            publicKey,
            serverUrl: `${window.location.origin}/api/wallet/sign`,
          }),
        },
        accountPreset: accountPresets.argentXV050,
        deploy: "if_needed",
        feeMode: "sponsored",
      });

      // Register swap provider for wallet.getQuote() / wallet.swap().
      w.registerSwapProvider(new AvnuSwapProvider());
      w.setDefaultSwapProvider("avnu");

      setWallet(w);
      setAddress(w.address.toString());
    };

    try {
      await connectOnce(storedWalletId);
    } catch (err: unknown) {
      // If the stored wallet is invalid/expired, clear and retry with a fresh wallet.
      if (storedWalletId) {
        localStorage.removeItem(WALLET_ID_STORAGE_KEY);
        localStorage.removeItem(WALLET_ADDRESS_STORAGE_KEY);
        try {
          await connectOnce(null);
          return;
        } catch (err2: unknown) {
          setError(err2 instanceof Error ? err2.message : "Connection failed");
        }
      } else {
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(WALLET_ID_STORAGE_KEY);
    localStorage.removeItem(WALLET_ADDRESS_STORAGE_KEY);
    setWallet(null);
    setAddress(null);
    sdkRef.current = null;
  }, []);

  // Auto-reconnect if we already have a wallet id stored.
  useEffect(() => {
    const stored = localStorage.getItem(WALLET_ID_STORAGE_KEY);
    if (!stored) return;
    if (wallet || isConnecting) return;
    connect();
  }, [connect, wallet, isConnecting]);

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
