"use client";

import { useWallet } from "@/lib/wallet-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingPage() {
  const {
    wallet,
    address,
    isConnecting,
    error,
    connect,
    disconnect,
  } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (wallet && address) {
      router.push("/dashboard");
    }
  }, [wallet, address, router]);

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

        <div className="space-y-4 pt-4">
          <button
            type="button"
            onClick={connect}
            disabled={isConnecting}
            className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {isConnecting ? "Connecting…" : "Sign in with Email"}
          </button>

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

        <p className="text-sm text-gray-400 pt-6">Gasless deploy via paymaster · Starknet Sepolia · Vesu</p>
      </div>
    </main>
  );
}
