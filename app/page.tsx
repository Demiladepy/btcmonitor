"use client";

import {
  BTC_MONITOR_WALLET_ID_KEY,
  type BtcHealthNetwork,
  networkToChainId,
} from "@/lib/btc-health-network";
import { useWallet } from "@/lib/wallet-context";
import { chainDisplayLabel } from "@/lib/chain-label";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const { wallet, address, isConnecting, error, connect, disconnect, network, setNetwork } = useWallet();
  const router = useRouter();
  const [hasStoredWalletId, setHasStoredWalletId] = useState(false);

  useEffect(() => {
    setHasStoredWalletId(Boolean(typeof window !== "undefined" && localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY)));
  }, [wallet, isConnecting]);

  useEffect(() => {
    if (wallet && address) {
      router.push("/dashboard");
    }
  }, [wallet, address, router]);

  const clearStoredWallet = () => {
    disconnect();
    setHasStoredWalletId(false);
  };

  const handleNetworkChange = (next: BtcHealthNetwork) => {
    if (next === network) return;
    if (wallet || hasStoredWalletId) {
      const ok =
        typeof window !== "undefined" &&
        window.confirm(
          "Switching network clears this browser’s saved wallet. You can create or connect again on the new network. Continue?",
        );
      if (!ok) return;
    }
    setNetwork(next);
    setHasStoredWalletId(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
          BTC Health <span className="text-amber-500">Monitor</span>
        </h1>
        <p className="text-xl text-gray-500 leading-relaxed">
          Monitor your Vesu positions on Starknet.
          <br />
          Get alerts before liquidation.
        </p>

        <p className="text-sm text-gray-600 leading-relaxed">
          Access uses a Starknet smart wallet (gasless deploy where supported). Add an email for Telegram in{" "}
          <span className="font-medium text-gray-800">Dashboard → notifications</span>.
        </p>

        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-gray-500">Network:</span>
          <select
            value={network}
            onChange={(e) => handleNetworkChange(e.target.value as BtcHealthNetwork)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-900 font-medium"
            aria-label="Starknet network"
          >
            <option value="sepolia">Sepolia (testnet)</option>
            <option value="mainnet">Mainnet</option>
          </select>
          <span className="text-xs text-gray-400">{chainDisplayLabel(networkToChainId(network))}</span>
        </div>

        <div className="space-y-4 pt-4">
          {hasStoredWalletId && !wallet ? (
            <>
              <button
                type="button"
                onClick={() => connect()}
                disabled={isConnecting}
                className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {isConnecting ? "Connecting…" : "Continue to dashboard"}
              </button>
              <button
                type="button"
                onClick={clearStoredWallet}
                disabled={isConnecting}
                className="w-full h-12 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
              >
                Use a different wallet
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => connect()}
              disabled={isConnecting}
              className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait"
      >
              {isConnecting ? "Connecting…" : "Create Starknet wallet"}
            </button>
          )}

          {wallet && (
            <button
              type="button"
              onClick={disconnect}
              className="w-full text-sm text-red-500 hover:text-red-700"
            >
              Disconnect
            </button>
          )}
        </div>

        {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}

        <p className="text-sm text-gray-400 pt-6">
          Gasless deploy via paymaster where configured · Vesu
        </p>
      </div>
    </main>
  );
}
