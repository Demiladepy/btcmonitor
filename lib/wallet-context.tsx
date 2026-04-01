"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { StarkZap, OnboardStrategy, accountPresets, type WalletInterface } from "starkzap";

const PENDING_STORAGE_KEY = "btchealth_pending_starknet_wallet";

export interface PendingWallet {
  walletId: string;
  publicKey: string;
  address: string;
}

interface WalletState {
  wallet: WalletInterface | null;
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  /** After POST /api/wallet/starknet — fund this address with Sepolia STRK before deploy. */
  pendingWallet: PendingWallet | null;
  /** Step 1: create Privy wallet and show address for funding. */
  prepareWallet: () => Promise<void>;
  /** Step 2: run StarkZap onboard + deploy (needs STRK on `pendingWallet.address`). */
  continueAfterFunding: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

function readPendingFromStorage(): PendingWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingWallet;
    if (p?.walletId && p?.publicKey && p?.address) return p;
  } catch {
    /* ignore */
  }
  return null;
}

function writePendingToStorage(p: PendingWallet | null) {
  if (typeof window === "undefined") return;
  if (p) sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(p));
  else sessionStorage.removeItem(PENDING_STORAGE_KEY);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingWallet, setPendingWallet] = useState<PendingWallet | null>(null);
  const sdkRef = useRef<StarkZap | null>(null);
  const pendingRef = useRef<PendingWallet | null>(null);

  useEffect(() => {
    pendingRef.current = pendingWallet;
  }, [pendingWallet]);

  useEffect(() => {
    const restored = readPendingFromStorage();
    if (restored) setPendingWallet(restored);
  }, []);

  const prepareWallet = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/starknet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        wallet?: { id: string; publicKey: string; address: string };
      };
      if (!res.ok) {
        throw new Error(
          data.error || `Wallet API failed (${res.status}). Check server logs and PRIVY_APP_ID / PRIVY_APP_SECRET.`,
        );
      }
      if (!data.wallet?.id || !data.wallet?.publicKey || !data.wallet?.address) {
        throw new Error("Wallet API returned an invalid payload.");
      }
      const p: PendingWallet = {
        walletId: data.wallet.id,
        publicKey: data.wallet.publicKey,
        address: data.wallet.address,
      };
      setPendingWallet(p);
      writePendingToStorage(p);
    } catch (err: unknown) {
      console.error("Prepare wallet failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create wallet");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const continueAfterFunding = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) {
      setError("No wallet to deploy. Start from step 1.");
      return;
    }

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
          resolve: async () => ({
            walletId: p.walletId,
            publicKey: p.publicKey,
            serverUrl: `${window.location.origin}/api/wallet/sign`,
          }),
        },
        accountPreset: accountPresets.argentXV050,
        deploy: "if_needed",
        feeMode: "user_pays",
      });

      setWallet(w);
      setAddress(w.address.toString());
      setPendingWallet(null);
      writePendingToStorage(null);
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
    setPendingWallet(null);
    writePendingToStorage(null);
    sdkRef.current = null;
  }, []);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        address,
        isConnecting,
        error,
        pendingWallet,
        prepareWallet,
        continueAfterFunding,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be inside WalletProvider");
  return ctx;
}
