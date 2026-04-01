"use client";

import { useWallet } from "@/lib/wallet-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const STRK_FAUCET = "https://starknet-faucet.vercel.app";

export default function LandingPage() {
  const {
    wallet,
    address,
    isConnecting,
    error,
    pendingWallet,
    prepareWallet,
    continueAfterFunding,
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

        {pendingWallet && !wallet ? (
          <div className="space-y-4 pt-4 text-left">
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">Fund your account (Sepolia STRK)</p>
              <p className="text-sm text-gray-600">
                Deploying the account uses <strong>user-paid</strong> fees. Send Sepolia STRK to your address
                first, then continue.
              </p>
              <p className="text-xs font-mono break-all text-gray-800 bg-white border border-gray-200 rounded-lg p-2">
                {pendingWallet.address}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={STRK_FAUCET}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center text-sm py-2 px-3 rounded-lg bg-white border border-amber-400 text-amber-800 hover:bg-amber-100"
                >
                  Open STRK faucet ↗
                </a>
                <a
                  href={`https://sepolia.voyager.online/contract/${pendingWallet.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center text-sm py-2 px-3 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  View on Voyager ↗
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={continueAfterFunding}
              disabled={isConnecting}
              className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {isConnecting ? "Deploying account…" : "I’ve funded — deploy & continue"}
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="w-full text-sm text-gray-500 hover:text-gray-800"
            >
              Cancel and start over
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            <button
              type="button"
              onClick={prepareWallet}
              disabled={isConnecting}
              className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {isConnecting ? "Creating wallet…" : "Sign in with Email"}
            </button>

            <button
              type="button"
              onClick={prepareWallet}
              disabled={isConnecting}
              className="w-full h-14 border-2 border-[#1E3A5F] text-[#1E3A5F] text-lg font-semibold rounded-xl hover:bg-[#1E3A5F] hover:text-white transition-colors disabled:opacity-50"
            >
              Connect Existing Wallet
            </button>
          </div>
        )}

        {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}

        <p className="text-sm text-gray-400 pt-6">You pay network fees (STRK) · Starknet Sepolia · Vesu</p>
      </div>
    </main>
  );
}
