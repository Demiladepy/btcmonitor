"use client";

import { BTC_MONITOR_WALLET_ID_KEY, BTC_MONITOR_CONNECTION_METHOD_KEY } from "@/lib/btc-health-network";
import { useWallet, type ConnectionMethod } from "@/lib/wallet-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const { wallet, address, isConnecting, isAuthBusy, error, connect, disconnect } = useWallet();
  const router = useRouter();
  const [hasStoredWallet, setHasStoredWallet] = useState(false);
  const [storedMethod, setStoredMethod] = useState<ConnectionMethod>("privy");
  const [connectingMethod, setConnectingMethod] = useState<ConnectionMethod | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" && localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY);
    const method = (localStorage.getItem(BTC_MONITOR_CONNECTION_METHOD_KEY) as ConnectionMethod) ?? "privy";
    setHasStoredWallet(Boolean(stored));
    setStoredMethod(method);
  }, [wallet, isAuthBusy]);

  useEffect(() => {
    if (wallet && address) {
      router.push("/dashboard");
    }
  }, [wallet, address, router]);

  const handleConnect = async (method: ConnectionMethod) => {
    setConnectingMethod(method);
    try {
      await connect(method);
    } finally {
      setConnectingMethod(null);
    }
  };

  const clearStoredWallet = () => {
    disconnect();
    setHasStoredWallet(false);
  };

  const methodLabel = (m: ConnectionMethod) => {
    if (m === "privy") return "Email / Social";
    if (m === "cartridge") return "Cartridge";
    return "Argent / Braavos";
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
            BTC Health <span className="text-amber-500">Monitor</span>
          </h1>
          <p className="mt-4 text-xl text-gray-500 leading-relaxed">
            Monitor your Vesu positions on Starknet.
            <br />
            Get alerts before liquidation.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-1.5 text-sm font-medium text-green-800">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Gasless on Starknet Mainnet
        </div>

        {/* Returning user — quick reconnect */}
        {hasStoredWallet && !wallet && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleConnect(storedMethod)}
              disabled={isAuthBusy}
              className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait min-h-[44px]"
            >
              {isAuthBusy ? "Connecting..." : `Continue (${methodLabel(storedMethod)})`}
            </button>
            <button
              type="button"
              onClick={clearStoredWallet}
              disabled={isAuthBusy}
              className="w-full h-10 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50"
            >
              Use a different wallet
            </button>
          </div>
        )}

        {/* New user — 3 connection options */}
        {(!hasStoredWallet || wallet) && (
          <div className="space-y-3">
            {/* Option A: Privy — email / social */}
            <button
              type="button"
              onClick={() => handleConnect("privy")}
              disabled={isAuthBusy}
              className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-3 min-h-[44px]"
            >
              {connectingMethod === "privy" && isAuthBusy ? (
                <>
                  <span className="inline-block animate-spin rounded-full border-2 border-white border-t-transparent w-5 h-5" />
                  Connecting...
                </>
              ) : (
                <>
                  <span className="text-xl">✉</span>
                  Sign in with Email
                </>
              )}
            </button>

            {/* Option B: Cartridge — social / passkey */}
            <button
              type="button"
              onClick={() => handleConnect("cartridge")}
              disabled={isAuthBusy}
              className="w-full h-14 bg-gray-900 hover:bg-gray-700 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-3 min-h-[44px]"
            >
              {connectingMethod === "cartridge" && isConnecting ? (
                <>
                  <span className="inline-block animate-spin rounded-full border-2 border-white border-t-transparent w-5 h-5" />
                  Connecting...
                </>
              ) : (
                <>
                  <span className="text-xl">🎮</span>
                  Sign in with Google
                  <span className="text-xs text-gray-400 ml-1">(Cartridge)</span>
                </>
              )}
            </button>

            {/* Option C: External — Argent / Braavos */}
            <button
              type="button"
              onClick={() => handleConnect("external")}
              disabled={isAuthBusy}
              className="w-full h-14 border-2 border-amber-500 text-amber-700 text-lg font-semibold rounded-xl hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-3 min-h-[44px]"
            >
              {connectingMethod === "external" && isConnecting ? (
                <>
                  <span className="inline-block animate-spin rounded-full border-2 border-amber-500 border-t-transparent w-5 h-5" />
                  Opening wallet...
                </>
              ) : (
                <>
                  <span className="text-xl">🦊</span>
                  Connect Argent / Braavos
                </>
              )}
            </button>

            {wallet && (
              <button
                type="button"
                onClick={disconnect}
                className="w-full text-sm text-red-500 hover:text-red-700 pt-1"
              >
                Disconnect
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <p className="text-xs text-gray-400 pt-2">
          Email login creates a gasless Starknet wallet via Privy ·{" "}
          Argent/Braavos users connect their existing wallet
        </p>
      </div>
    </main>
  );
}
