"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePrivy, useLogin } from "@privy-io/react-auth";
// Type-only imports — erased at compile time, zero bundle cost
import type { WalletInterface } from "starkzap";
import { getAvnuPaymasterConfig } from "@/lib/avnu-paymaster";
import {
  BTC_MONITOR_WALLET_ID_KEY,
  BTC_MONITOR_WALLET_ADDRESS_KEY,
  BTC_MONITOR_CONNECTION_METHOD_KEY,
} from "@/lib/btc-health-network";

// Starknet mainnet wBTC address
const WBTC_MAINNET = "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac";
// Vesu Singleton mainnet (Cartridge session policies)
const VESU_SINGLETON = "0x02545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef";

export type ConnectionMethod = "privy" | "cartridge" | "external";

interface WalletState {
  wallet: WalletInterface | null;
  address: string | null;
  connectionMethod: ConnectionMethod | null;
  isConnecting: boolean;
  /** True while Privy modal is open or email flow is finishing — keep landing buttons in a loading state. */
  isAuthBusy: boolean;
  error: string | null;
  connect: (method?: ConnectionMethod) => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

// Lazy-loaded SDK instance — only imported when the user actually connects.
// This keeps starkzap OUT of the initial layout bundle for fast page load.
let sdkCache: any = null;
async function getOrCreateSdk() {
  if (sdkCache) return sdkCache;
  const { StarkZap } = await import("starkzap");
  sdkCache = new StarkZap({ network: "mainnet", paymaster: getAvnuPaymasterConfig() });
  return sdkCache;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Privy auth state — available because PrivyProvider wraps us in layout.tsx
  const { logout: privyLogout, authenticated, user, getAccessToken, ready } = usePrivy();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Flag: we called login() and are waiting for the modal to complete
  const [pendingPrivyConnect, setPendingPrivyConnect] = useState(false);
  /** When true, `connect()` returned early for Privy — skip `finally` clearing `isConnecting`. */
  const privyAwaitingModalRef = useRef(false);

  // useLogin is called ONCE here. Its `login` function opens the Privy email modal.
  // onError fires when the user closes the modal or auth fails.
  const { login: openPrivyModal } = useLogin({
    onComplete: () => {
      // Auth succeeded — the useEffect below handles wallet setup
    },
    onError: () => {
      // User closed the modal or an error occurred — reset loading state
      privyAwaitingModalRef.current = false;
      setPendingPrivyConnect(false);
      setIsConnecting(false);
      setError("Sign-in cancelled or failed. Please try again.");
    },
  });

  // Store openPrivyModal in a ref so the `connect` useCallback can call it
  // without needing it as a dependency (it's stable, but refs are safer here).
  const openPrivyModalRef = useRef(openPrivyModal);
  useEffect(() => {
    openPrivyModalRef.current = openPrivyModal;
  }, [openPrivyModal]);

  const disconnect = useCallback(() => {
    privyAwaitingModalRef.current = false;
    setPendingPrivyConnect(false);
    localStorage.removeItem(BTC_MONITOR_WALLET_ID_KEY);
    localStorage.removeItem(BTC_MONITOR_WALLET_ADDRESS_KEY);
    localStorage.removeItem(BTC_MONITOR_CONNECTION_METHOD_KEY);
    sdkCache = null; // Reset SDK so next connect re-initialises
    setWallet(null);
    setAddress(null);
    setConnectionMethod(null);
    // Sign out of Privy so the next "Sign in with Email" shows the modal again
    privyLogout().catch(() => undefined);
  }, [privyLogout]);

  /**
   * Called AFTER Privy authentication is confirmed.
   * Gets an auth token, fetches or creates the server wallet, then onboards with StarkZap.
   * The auth token lets the server verify identity and recover the wallet cross-device.
   */
  const completePrivySetup = useCallback(async (privyUser?: typeof user) => {
    privyAwaitingModalRef.current = false;
    const resolvedUser = privyUser ?? userRef.current;
    const { OnboardStrategy, accountPresets, AvnuSwapProvider } = await import("starkzap");
    const sdk = await getOrCreateSdk();

    // Privy access token — the server verifies this to identify the user
    const token = await getAccessToken();
    const storedWalletId = localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY);

    // Include the user's email so the server can recover their wallet on new devices
    const userEmail = resolvedUser?.email?.address ?? null;

    const res = await fetch("/api/wallet/starknet", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Auth token — server verifies this to confirm identity before wallet access
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        ...(storedWalletId ? { existingWalletId: storedWalletId } : {}),
        ...(userEmail ? { email: userEmail } : {}),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      wallet?: { id: string; publicKey: string; address: string };
    };

    if (!res.ok) {
      if (storedWalletId) {
        localStorage.removeItem(BTC_MONITOR_WALLET_ID_KEY);
        localStorage.removeItem(BTC_MONITOR_WALLET_ADDRESS_KEY);
        throw new Error("Wallet session expired — please try again");
      }
      throw new Error(data.error || `Wallet API failed (${res.status})`);
    }
    if (!data.wallet?.id || !data.wallet?.publicKey || !data.wallet?.address) {
      throw new Error("Wallet API returned invalid payload");
    }

    const { id: walletId, publicKey, address: walletAddress } = data.wallet;
    localStorage.setItem(BTC_MONITOR_WALLET_ID_KEY, walletId);
    localStorage.setItem(BTC_MONITOR_WALLET_ADDRESS_KEY, walletAddress);

    const { wallet: privyWallet } = await sdk.onboard({
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

    const w = privyWallet;
    w.registerSwapProvider(new AvnuSwapProvider());
    w.setDefaultSwapProvider("avnu");

    const finalAddress = w.address.toString();
    setWallet(w);
    setAddress(finalAddress);
    setConnectionMethod("privy");
    localStorage.setItem(BTC_MONITOR_CONNECTION_METHOD_KEY, "privy");
    setIsConnecting(false);
  }, [getAccessToken]);

  // When Privy auth completes (modal closed with success), run wallet setup
  useEffect(() => {
    if (!authenticated || !user || !pendingPrivyConnect) return;
    privyAwaitingModalRef.current = false;
    setPendingPrivyConnect(false);
    completePrivySetup(userRef.current ?? undefined).catch((err) => {
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnecting(false);
    });
  }, [authenticated, user, pendingPrivyConnect, completePrivySetup]);

  const connect = useCallback(
    async (method: ConnectionMethod = "privy") => {
      setIsConnecting(true);
      setError(null);
      privyAwaitingModalRef.current = false;

      try {
        // ── Option A: Privy — email authentication ─────────────────────────────
        if (method === "privy") {
          if (!authenticated) {
            // Open Privy email modal. The useEffect above completes setup after the user
            // verifies their email. isConnecting stays true until that effect runs.
            privyAwaitingModalRef.current = true;
            setPendingPrivyConnect(true);
            openPrivyModalRef.current?.();
            return;
          }
          // Already authenticated (Privy session still active) — skip the modal
          await completePrivySetup(userRef.current ?? undefined);
          return;
        }

        // ── Lazy-import starkzap — only paid on first connect ──────────────────
        const { OnboardStrategy, accountPresets, AvnuSwapProvider } = await import("starkzap");
        const sdk = await getOrCreateSdk();
        let w: WalletInterface;

        if (method === "cartridge") {
          // ── Option B: Cartridge Controller — social/passkey ─────────────────
          const { wallet: cartridgeWallet } = await sdk.onboard({
            strategy: OnboardStrategy.Cartridge,
            cartridge: {
              policies: [
                { target: VESU_SINGLETON, method: "modify_position" },
                { target: VESU_SINGLETON, method: "liquidate_position" },
                { target: WBTC_MAINNET, method: "approve" },
              ],
            },
            deploy: "never",
          } as any);
          w = cartridgeWallet;

          const addr = w.address.toString();
          localStorage.setItem(BTC_MONITOR_WALLET_ID_KEY, addr);
          localStorage.setItem(BTC_MONITOR_WALLET_ADDRESS_KEY, addr);
        } else {
          // ── Option C: External wallet — Argent X / Braavos ──────────────────
          const { connect: starknetKitConnect } = await import("starknetkit");
          const result = await starknetKitConnect({
            modalMode: "alwaysAsk",
            dappName: "BTC Health Monitor",
          });
          if (!result?.wallet) throw new Error("No wallet selected");

          const externalAccount = (result.wallet as any).account;
          if (!externalAccount) throw new Error("Wallet account not available");

          const externalSigner = externalAccount.signer as any;
          const wrappedWallet = await sdk.connectWallet({
            account: {
              signer: {
                async getPubKey() {
                  if (typeof externalSigner?.getPubKey === "function") {
                    return externalSigner.getPubKey();
                  }
                  return externalAccount.address;
                },
                async signRaw(hash: string) {
                  if (typeof externalSigner?.signRaw === "function") {
                    return externalSigner.signRaw(hash);
                  }
                  const sig = await (externalAccount as any).signMessage({
                    types: {},
                    primaryType: "",
                    message: { hash },
                  });
                  return Array.isArray(sig) ? sig.join(",") : String(sig);
                },
              },
              accountClass: accountPresets.argentXV050,
            },
            accountAddress: externalAccount.address,
          } as any);
          w = wrappedWallet;

          const addr = w.address?.toString() ?? externalAccount.address;
          localStorage.setItem(BTC_MONITOR_WALLET_ID_KEY, addr);
          localStorage.setItem(BTC_MONITOR_WALLET_ADDRESS_KEY, addr);
        }

        w.registerSwapProvider(new AvnuSwapProvider());
        w.setDefaultSwapProvider("avnu");

        const finalAddress = w.address.toString();
        setWallet(w);
        setAddress(finalAddress);
        setConnectionMethod(method);
        localStorage.setItem(BTC_MONITOR_CONNECTION_METHOD_KEY, method);

        // Ensure DB record exists for non-Privy users
        fetch("/api/user/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: finalAddress, connectionMethod: method }),
        }).catch(() => undefined);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Connection failed");
      } finally {
        if (!privyAwaitingModalRef.current) {
          setIsConnecting(false);
        }
      }
    },
    [authenticated, completePrivySetup],
  );

  // Auto-reconnect everywhere except the landing page.
  // Waits for Privy to be `ready` before deciding — avoids false "not authenticated" on mount.
  // External wallets skip auto-reconnect (require manual connect via browser extension).
  // Privy users only auto-reconnect if the Privy session is still active (authenticated=true).
  useEffect(() => {
    if (pathname === "/") return;
    if (!ready) return; // Privy not yet initialised — wait
    const stored = localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY);
    if (!stored) return;
    if (wallet || isConnecting) return;
    const storedMethod =
      (localStorage.getItem(BTC_MONITOR_CONNECTION_METHOD_KEY) as ConnectionMethod) ?? "privy";
    if (storedMethod === "external") return;
    // For Privy: skip auto-reconnect if the session expired — user must log in again
    if (storedMethod === "privy" && !authenticated) return;
    void connect(storedMethod);
  }, [pathname, wallet, isConnecting, connect, ready, authenticated]);

  const isAuthBusy = isConnecting || pendingPrivyConnect;

  return (
    <WalletContext.Provider
      value={{
        wallet,
        address,
        connectionMethod,
        isConnecting,
        isAuthBusy,
        error,
        connect,
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

/** Returns the stored user identifier (Privy wallet ID or wallet address). */
export function getStoredWalletId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY);
}
