"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { StarkZap, OnboardStrategy, accountPresets, type WalletInterface, AvnuSwapProvider } from "starkzap";
import {
  type BtcHealthNetwork,
  BTC_HEALTH_NETWORK_STORAGE_KEY,
  BTC_MONITOR_WALLET_ADDRESS_KEY,
  BTC_MONITOR_WALLET_ID_KEY,
  defaultBtcHealthNetwork,
  getEffectiveBtcHealthNetwork,
  networkToChainId,
} from "@/lib/btc-health-network";

// Required for Starknet "sponsored" (gasless) transactions via AVNU paymaster.
// This is intentionally `NEXT_PUBLIC_` because wallet onboarding happens in the browser.
const AVNU_PAYMASTER_API_KEY =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY ?? process.env.NEXT_PUBLIC_PAYMASTER_API_KEY;

interface WalletState {
  wallet: WalletInterface | null;
  address: string | null;
  network: BtcHealthNetwork;
  setNetwork: (next: BtcHealthNetwork) => void;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetworkState] = useState<BtcHealthNetwork>(() => defaultBtcHealthNetwork());

  useEffect(() => {
    setNetworkState(getEffectiveBtcHealthNetwork());
  }, []);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sdkRef = useRef<StarkZap | null>(null);

  const setNetwork = useCallback((next: BtcHealthNetwork) => {
    if (next === network) return;
    try {
      localStorage.setItem(BTC_HEALTH_NETWORK_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    localStorage.removeItem(BTC_MONITOR_WALLET_ID_KEY);
    localStorage.removeItem(BTC_MONITOR_WALLET_ADDRESS_KEY);
    setWallet(null);
    setAddress(null);
    sdkRef.current = null;
    setNetworkState(next);
  }, [network]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(BTC_MONITOR_WALLET_ID_KEY);
    localStorage.removeItem(BTC_MONITOR_WALLET_ADDRESS_KEY);
    setWallet(null);
    setAddress(null);
    sdkRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    const storedWalletId = localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY);
    const chainId = networkToChainId(network);
    const rpcUrl = `${window.location.origin}/api/starknet-rpc?network=${encodeURIComponent(network)}`;

    const connectOnce = async (existingWalletId?: string | null) => {
      if (!sdkRef.current) {
        const paymaster =
          AVNU_PAYMASTER_API_KEY
            ? {
                headers: { "x-paymaster-api-key": AVNU_PAYMASTER_API_KEY },
              }
            : undefined;

        sdkRef.current = new StarkZap({
          rpcUrl,
          chainId,
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

      localStorage.setItem(BTC_MONITOR_WALLET_ID_KEY, walletId);
      localStorage.setItem(BTC_MONITOR_WALLET_ADDRESS_KEY, walletAddress);

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

      w.registerSwapProvider(new AvnuSwapProvider());
      w.setDefaultSwapProvider("avnu");

      setWallet(w);
      setAddress(w.address.toString());
    };

    try {
      await connectOnce(storedWalletId);
    } catch (err: unknown) {
      if (storedWalletId) {
        localStorage.removeItem(BTC_MONITOR_WALLET_ID_KEY);
        localStorage.removeItem(BTC_MONITOR_WALLET_ADDRESS_KEY);
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
  }, [network]);

  // Recreate SDK if network changes while disconnected.
  useEffect(() => {
    sdkRef.current = null;
  }, [network]);

  // Auto-reconnect everywhere except the landing page (explicit "Continue" there).
  useEffect(() => {
    if (pathname === "/") return;
    const stored = localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY);
    if (!stored) return;
    if (wallet || isConnecting) return;
    void connect();
  }, [pathname, wallet, isConnecting, connect]);

  return (
    <WalletContext.Provider value={{ wallet, address, network, setNetwork, isConnecting, error, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be inside WalletProvider");
  return ctx;
}
