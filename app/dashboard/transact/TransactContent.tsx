"use client";

import { useWallet } from "@/lib/wallet-context";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { getPresets, Amount, fromAddress } from "starkzap";

type Action = "send" | "deposit" | "borrow" | "repay";

export function TransactContent() {
  const { wallet } = useWallet();
  const router = useRouter();
  const params = useSearchParams();

  const [action, setAction] = useState<Action>((params.get("action") as Action) || "send");
  const [tokenSymbol, setTokenSymbol] = useState(params.get("token") || "ETH");
  const [collateral, setCollateral] = useState(params.get("collateral") || "ETH");
  const [debt, setDebt] = useState(params.get("debt") || "USDC");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState<"idle" | "simulating" | "executing" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<{
    current?: { isCollateralized: boolean };
    projected?: { isCollateralized: boolean } | null;
  } | null>(null);

  useEffect(() => {
    if (!wallet) router.push("/");
  }, [wallet, router]);

  const handleSimulate = useCallback(async () => {
    if (!wallet || !amount || action !== "borrow") return;
    setStatus("simulating");
    setSimulation(null);
    try {
      const tokens = getPresets(wallet.getChainId());
      const quote = await wallet.lending().quoteHealth({
        action: {
          action: "borrow",
          request: {
            collateralToken: tokens[collateral],
            debtToken: tokens[debt],
            amount: Amount.parse(amount, tokens[debt]),
          },
        },
        health: { collateralToken: tokens[collateral], debtToken: tokens[debt] },
        feeMode: "user_pays",
      });
      setSimulation({
        current: quote.current,
        projected: quote.projected ?? undefined,
      });
      setStatus("idle");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Simulation failed");
      setStatus("error");
    }
  }, [wallet, amount, action, collateral, debt]);

  const handleExecute = useCallback(async () => {
    if (!wallet || !amount) return;
    setStatus("executing");
    setErrorMsg(null);

    try {
      const tokens = getPresets(wallet.getChainId());
      let tx;

      switch (action) {
        case "send":
          tx = await wallet.transfer(
            tokens[tokenSymbol],
            [{ to: fromAddress(recipient), amount: Amount.parse(amount, tokens[tokenSymbol]) }],
            { feeMode: "user_pays" },
          );
          break;

        case "deposit":
          tx = await wallet.lending().deposit(
            { token: tokens[tokenSymbol], amount: Amount.parse(amount, tokens[tokenSymbol]) },
            { feeMode: "user_pays" },
          );
          break;

        case "borrow":
          tx = await wallet.lending().borrow(
            {
              collateralToken: tokens[collateral],
              debtToken: tokens[debt],
              amount: Amount.parse(amount, tokens[debt]),
            },
            { feeMode: "user_pays" },
          );
          break;

        case "repay":
          tx = await wallet.lending().repay(
            {
              collateralToken: tokens[collateral],
              debtToken: tokens[debt],
              amount: Amount.parse(amount, tokens[debt]),
            },
            { feeMode: "user_pays" },
          );
          break;
      }

      if (tx) {
        setTxHash(tx.hash);
        await tx.wait();
        setStatus("success");
      }
    } catch (err: unknown) {
      console.error("Tx failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
      setStatus("error");
    }
  }, [wallet, action, tokenSymbol, collateral, debt, amount, recipient]);

  if (!wallet) return null;

  const actions: Action[] = ["send", "deposit", "borrow", "repay"];

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-200 px-6 py-4 max-w-6xl mx-auto">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Back to Dashboard
        </button>
      </nav>

      <div className="max-w-lg mx-auto px-6 py-12 space-y-6">
        <h2 className="text-3xl font-bold text-center">Transact</h2>

        <div className="grid grid-cols-4 bg-gray-100 rounded-xl p-1 gap-1">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAction(a);
                setStatus("idle");
                setSimulation(null);
                setErrorMsg(null);
              }}
              className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                action === a ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        {(action === "send" || action === "deposit") && (
          <div>
            <label htmlFor="transact-token" className="block text-sm font-medium text-gray-700 mb-2">
              Token
            </label>
            <select
              id="transact-token"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value)}
              className="w-full h-14 rounded-xl border border-gray-300 px-4 text-lg bg-white"
            >
              {["ETH", "STRK", "USDC", "WBTC"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {(action === "borrow" || action === "repay") && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="transact-collateral" className="block text-sm font-medium text-gray-700 mb-2">
                Collateral
              </label>
              <select
                id="transact-collateral"
                value={collateral}
                onChange={(e) => setCollateral(e.target.value)}
                className="w-full h-14 rounded-xl border border-gray-300 px-4 text-lg bg-white"
              >
                {["ETH", "WBTC"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="transact-debt" className="block text-sm font-medium text-gray-700 mb-2">
                Debt Token
              </label>
              <select
                id="transact-debt"
                value={debt}
                onChange={(e) => setDebt(e.target.value)}
                className="w-full h-14 rounded-xl border border-gray-300 px-4 text-lg bg-white"
              >
                {["USDC", "USDT"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="transact-amount" className="block text-sm font-medium text-gray-700 mb-2">
            Amount
          </label>
          <input
            id="transact-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-14 rounded-xl border border-gray-300 px-4 text-2xl font-semibold bg-white"
          />
        </div>

        {action === "send" && (
          <div>
            <label htmlFor="transact-recipient" className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Address
            </label>
            <input
              id="transact-recipient"
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="w-full h-14 rounded-xl border border-gray-300 px-4 text-sm font-mono bg-white"
            />
          </div>
        )}

        {action === "borrow" && amount && (
          <button
            type="button"
            onClick={handleSimulate}
            disabled={status === "simulating"}
            className="w-full h-12 border-2 border-amber-500 text-amber-600 rounded-xl font-medium hover:bg-amber-50 disabled:opacity-50"
          >
            {status === "simulating" ? "Simulating..." : "Preview Health Impact"}
          </button>
        )}

        {simulation && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-1">
            <p>Current: {simulation.current?.isCollateralized ? "✅ Safe" : "⚠️ At risk"}</p>
            <p>
              After borrow:{" "}
              {simulation.projected == null
                ? "—"
                : simulation.projected.isCollateralized
                  ? "✅ Still safe"
                  : "🚨 WOULD BE LIQUIDATABLE"}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleExecute}
          disabled={!amount || status === "executing" || (action === "send" && !recipient)}
          className="w-full h-14 bg-amber-500 text-white text-lg font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40"
        >
          {status === "executing" ? "Executing..." : `Execute ${action.charAt(0).toUpperCase() + action.slice(1)}`}
        </button>

        {status === "success" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-2">
            <p className="text-green-700 font-medium">Transaction confirmed!</p>
            {txHash && (
              <a
                href={`https://sepolia.voyager.online/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-green-600 underline"
              >
                View on Voyager →
              </a>
            )}
          </div>
        )}

        {status === "error" && errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-600 text-sm">{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
