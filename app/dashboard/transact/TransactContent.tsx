"use client";

import { voyagerTxUrl } from "@/lib/explorer";
import { isValidStarknetAddress } from "@/lib/starknet-address";
import { useWallet } from "@/lib/wallet-context";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { getPresets, Amount, fromAddress, type SwapQuote } from "starkzap";

type Action = "send" | "swap" | "deposit" | "borrow" | "repay";

const MIN_BORROW_HEALTH = 1.05;

function parsePositiveAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function ratioFromHealth(h: { collateralValue: bigint; debtValue: bigint } | null | undefined): number | null {
  if (!h) return null;
  const d = Number(h.debtValue);
  if (!Number.isFinite(d) || d <= 0) return null;
  return Number(h.collateralValue) / d;
}

function formatTxError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  const msg = (err as { message?: unknown })?.message;
  if (typeof msg === "string" && msg.length > 0) return msg;
  return "Transaction failed. Please try again.";
}

export function TransactContent() {
  const { wallet } = useWallet();
  const router = useRouter();
  const params = useSearchParams();
  const submitLockRef = useRef(false);

  const [action, setAction] = useState<Action>((params.get("action") as Action) || "send");
  const [tokenSymbol, setTokenSymbol] = useState(params.get("token") || "ETH");
  const [collateral, setCollateral] = useState(params.get("collateral") || "ETH");
  const [debt, setDebt] = useState(params.get("debt") || "USDC");

  const [swapTokenIn, setSwapTokenIn] = useState(params.get("tokenIn") || "USDC");
  const [swapTokenOut, setSwapTokenOut] = useState(params.get("tokenOut") || "ETH");

  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState<"idle" | "simulating" | "executing" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [swapQuote, setSwapQuote] = useState<SwapQuote | null>(null);
  const [swapQuoting, setSwapQuoting] = useState(false);
  const [simulation, setSimulation] = useState<{
    current?: { isCollateralized: boolean; collateralValue: bigint; debtValue: bigint };
    projected?: { isCollateralized: boolean; collateralValue: bigint; debtValue: bigint } | null;
    currentRatio: number | null;
    projectedRatio: number | null;
    /** Amount + pair this preview was computed for — must match at execute time. */
    previewKey: string;
  } | null>(null);

  const actionParam = params.get("action");
  const tokenParam = params.get("token");
  const collateralParam = params.get("collateral");
  const debtParam = params.get("debt");
  const swapTokenInParam = params.get("tokenIn");
  const swapTokenOutParam = params.get("tokenOut");

  // Sync state when navigation updates query params.
  useEffect(() => {
    const validActions: Action[] = ["send", "swap", "deposit", "borrow", "repay"];
    if (actionParam && validActions.includes(actionParam as Action)) {
      const nextAction = actionParam as Action;
      setAction(nextAction);
      setStatus("idle");
      setSimulation(null);
      setSwapQuote(null);
      setErrorMsg(null);
      setTxHash(null);
    }

    if (tokenParam) setTokenSymbol(tokenParam);
    if (collateralParam) setCollateral(collateralParam);
    if (debtParam) setDebt(debtParam);
    if (swapTokenInParam) setSwapTokenIn(swapTokenInParam);
    if (swapTokenOutParam) setSwapTokenOut(swapTokenOutParam);
  }, [actionParam, tokenParam, collateralParam, debtParam, swapTokenInParam, swapTokenOutParam]);

  useEffect(() => {
    if (!wallet) router.push("/");
  }, [wallet, router]);

  // When inputs change on Swap, clear the previous quote.
  useEffect(() => {
    if (action !== "swap") return;
    setSwapQuote(null);
    setErrorMsg(null);
    setStatus("idle");
  }, [action, swapTokenIn, swapTokenOut, amount]);

  const handleSimulate = useCallback(async () => {
    if (!wallet || !amount || action !== "borrow") return;
    const n = parsePositiveAmount(amount);
    if (n === null) {
      setErrorMsg("Amount must be greater than 0");
      setStatus("error");
      return;
    }
    setStatus("simulating");
    setSimulation(null);
    setErrorMsg(null);
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
        feeMode: "sponsored",
      });
      setSimulation({
        current: quote.current,
        projected: quote.projected ?? undefined,
        currentRatio: ratioFromHealth(quote.current),
        projectedRatio: quote.projected ? ratioFromHealth(quote.projected) : null,
        previewKey: `${collateral}|${debt}|${amount.trim()}`,
      });
      setStatus("idle");
    } catch (err: unknown) {
      setErrorMsg(formatTxError(err));
      setStatus("error");
    }
  }, [wallet, amount, action, collateral, debt]);

  const handleGetSwapQuote = useCallback(async () => {
    if (!wallet || !amount || action !== "swap") return;
    if (parsePositiveAmount(amount) === null) {
      setErrorMsg("Amount must be greater than 0");
      setStatus("error");
      return;
    }
    setSwapQuoting(true);
    setStatus("idle");
    setErrorMsg(null);
    setSwapQuote(null);

    try {
      const tokens = getPresets(wallet.getChainId());
      const tokenIn = (tokens as Record<string, unknown>)[swapTokenIn] as any;
      const tokenOut = (tokens as Record<string, unknown>)[swapTokenOut] as any;

      if (!tokenIn || !tokenOut) throw new Error("Selected tokens are not available on this network.");

      const quote = await wallet.getQuote({
        tokenIn,
        tokenOut,
        amountIn: Amount.parse(amount, tokenIn),
      });

      setSwapQuote(quote);
    } catch (err: unknown) {
      setErrorMsg(formatTxError(err));
      setStatus("error");
    } finally {
      setSwapQuoting(false);
    }
  }, [wallet, amount, action, swapTokenIn, swapTokenOut]);

  const handleExecute = useCallback(async () => {
    if (!wallet || submitLockRef.current) return;
    if (parsePositiveAmount(amount) === null) {
      setErrorMsg("Amount must be greater than 0");
      setStatus("error");
      return;
    }

    const tokens = getPresets(wallet.getChainId());

    if (action === "send") {
      const r = recipient.trim();
      if (!isValidStarknetAddress(r)) {
        setErrorMsg("Invalid Starknet address");
        setStatus("error");
        return;
      }
      try {
        fromAddress(r);
      } catch {
        setErrorMsg("Invalid Starknet address");
        setStatus("error");
        return;
      }
    }

    if (action === "borrow") {
      const previewKey = `${collateral}|${debt}|${amount.trim()}`;
      if (!simulation || simulation.previewKey !== previewKey) {
        setErrorMsg("Preview health impact again — the amount or pair changed since the last preview.");
        setStatus("error");
        return;
      }
      if (simulation.projected && !simulation.projected.isCollateralized) {
        setErrorMsg("Borrow would leave the position liquidatable. Reduce the amount.");
        setStatus("error");
        return;
      }
      if (simulation.projectedRatio !== null && simulation.projectedRatio < MIN_BORROW_HEALTH) {
        setErrorMsg(
          `Projected health ${simulation.projectedRatio.toFixed(3)} is below the safe minimum (${MIN_BORROW_HEALTH}). Reduce the borrow amount.`,
        );
        setStatus("error");
        return;
      }
    }

    submitLockRef.current = true;
    setStatus("executing");
    setErrorMsg(null);

    try {
      let tx;

      const assertBalance = async (sym: string) => {
        const token = (tokens as Record<string, any>)[sym];
        if (!token) throw new Error(`Token ${sym} is not available on this network.`);
        const parsed = Amount.parse(amount.trim(), token);
        const bal = await wallet.balanceOf(token);
        const balBase = typeof (bal as { toBase?: () => bigint }).toBase === "function" ? (bal as { toBase: () => bigint }).toBase() : BigInt(0);
        if (parsed.toBase() > balBase) throw new Error("Insufficient balance");
      };

      switch (action) {
        case "send": {
          const token = (tokens as Record<string, any>)[tokenSymbol];
          await assertBalance(tokenSymbol);
          tx = await wallet.transfer(
            token,
            [{ to: fromAddress(recipient.trim()), amount: Amount.parse(amount.trim(), token) }],
            { feeMode: "sponsored" },
          );
          break;
        }

        case "swap": {
          if (!swapQuote) throw new Error("Get a quote before executing the swap.");
          const tokenIn = (tokens as Record<string, any>)[swapTokenIn];
          await assertBalance(swapTokenIn);
          tx = await wallet.swap(
            {
              tokenIn,
              tokenOut: (tokens as Record<string, any>)[swapTokenOut],
              amountIn: Amount.parse(amount.trim(), tokenIn),
              slippageBps: BigInt(50),
            },
            { feeMode: "sponsored" },
          );
          break;
        }

        case "deposit": {
          await assertBalance(tokenSymbol);
          tx = await wallet.lending().deposit(
            { token: (tokens as Record<string, any>)[tokenSymbol], amount: Amount.parse(amount.trim(), (tokens as Record<string, any>)[tokenSymbol]) },
            { feeMode: "sponsored" },
          );
          break;
        }

        case "borrow": {
          tx = await wallet.lending().borrow(
            {
              collateralToken: (tokens as Record<string, any>)[collateral],
              debtToken: (tokens as Record<string, any>)[debt],
              amount: Amount.parse(amount.trim(), (tokens as Record<string, any>)[debt]),
            },
            { feeMode: "sponsored" },
          );
          break;
        }

        case "repay": {
          await assertBalance(debt);
          tx = await wallet.lending().repay(
            {
              collateralToken: (tokens as Record<string, any>)[collateral],
              debtToken: (tokens as Record<string, any>)[debt],
              amount: Amount.parse(amount.trim(), (tokens as Record<string, any>)[debt]),
            },
            { feeMode: "sponsored" },
          );
          break;
        }
      }

      if (tx) {
        setTxHash(tx.hash);
        await tx.wait();
        setStatus("success");
      }
    } catch (err: unknown) {
      console.error("Tx failed:", err);
      setErrorMsg(formatTxError(err));
      setStatus("error");
    } finally {
      submitLockRef.current = false;
    }
  }, [
    wallet,
    action,
    tokenSymbol,
    collateral,
    debt,
    swapTokenIn,
    swapTokenOut,
    amount,
    recipient,
    simulation,
    swapQuote,
  ]);

  if (!wallet) return null;

  const presets = getPresets(wallet.getChainId());

  const actions: Action[] = ["send", "swap", "deposit", "borrow", "repay"];

  const amountOk = parsePositiveAmount(amount) !== null;
  const borrowUnsafe =
    simulation &&
    ((simulation.projectedRatio !== null && simulation.projectedRatio < MIN_BORROW_HEALTH) ||
      (simulation.projected != null && !simulation.projected.isCollateralized));

  const canExecuteBorrow = amountOk && simulation !== null && !borrowUnsafe;
  const canExecuteNonBorrow =
    action !== "borrow" && amountOk && (action !== "send" || recipient.trim().length > 0);

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

        <div className="grid grid-cols-5 bg-gray-100 rounded-xl p-1 gap-1">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAction(a);
                setStatus("idle");
                setSimulation(null);
                setErrorMsg(null);
                setTxHash(null);
                setSwapQuote(null);
                setSwapQuoting(false);
              }}
              className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors min-h-[44px] ${
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
              className="w-full h-14 rounded-xl border border-gray-300 px-4 text-lg bg-white min-h-[44px]"
            >
              {["ETH", "STRK", "USDC", "WBTC"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {action === "swap" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="swap-token-in" className="block text-sm font-medium text-gray-700 mb-2">
                Token In
              </label>
              <select
                id="swap-token-in"
                value={swapTokenIn}
                onChange={(e) => setSwapTokenIn(e.target.value)}
                className="w-full h-14 rounded-xl border border-gray-300 px-4 text-lg bg-white min-h-[44px]"
              >
                {["ETH", "STRK", "USDC", "WBTC"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="swap-token-out" className="block text-sm font-medium text-gray-700 mb-2">
                Token Out
              </label>
              <select
                id="swap-token-out"
                value={swapTokenOut}
                onChange={(e) => setSwapTokenOut(e.target.value)}
                className="w-full h-14 rounded-xl border border-gray-300 px-4 text-lg bg-white min-h-[44px]"
              >
                {["ETH", "STRK", "USDC", "WBTC"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
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
                className="w-full h-14 rounded-xl border border-gray-300 px-4 text-lg bg-white min-h-[44px]"
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
                className="w-full h-14 rounded-xl border border-gray-300 px-4 text-lg bg-white min-h-[44px]"
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
            className="w-full h-14 rounded-xl border border-gray-300 px-4 text-2xl font-semibold bg-white min-h-[44px]"
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
              className="w-full h-14 rounded-xl border border-gray-300 px-4 text-sm font-mono bg-white min-h-[44px]"
            />
          </div>
        )}

        {action === "borrow" && amount && (
          <button
            type="button"
            onClick={handleSimulate}
            disabled={status === "simulating" || !parsePositiveAmount(amount)}
            className="w-full h-12 border-2 border-amber-500 text-amber-600 rounded-xl font-medium hover:bg-amber-50 disabled:opacity-50 min-h-[44px]"
          >
            {status === "simulating" ? "Simulating..." : "Preview Health Impact"}
          </button>
        )}

        {simulation && action === "borrow" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
            <p>
              Current health:{" "}
              <span className="font-semibold">
                {simulation.currentRatio === null ? "—" : simulation.currentRatio.toFixed(3)}
              </span>
              {simulation.current?.isCollateralized === false && (
                <span className="text-red-600 font-medium"> (at risk)</span>
              )}
            </p>
            <p>
              After borrow:{" "}
              <span className="font-semibold">
                {simulation.projectedRatio === null ? "—" : simulation.projectedRatio.toFixed(3)}
              </span>
              {simulation.projected == null ? (
                <span className="text-gray-500"> (no projection)</span>
              ) : simulation.projected.isCollateralized ? (
                <span className="text-green-700 font-medium"> (safe)</span>
              ) : (
                <span className="text-red-700 font-medium"> (liquidatable)</span>
              )}
            </p>
            {borrowUnsafe && (
              <p className="text-red-700 font-semibold">
                Borrow blocked: health would fall below {MIN_BORROW_HEALTH} or the position would not stay collateralized.
              </p>
            )}
          </div>
        )}

        {action === "swap" && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGetSwapQuote}
              disabled={!amountOk || swapQuoting || status === "executing"}
              className="w-full h-12 border-2 border-amber-500 text-amber-600 rounded-xl font-medium hover:bg-amber-50 disabled:opacity-50 min-h-[44px]"
            >
              {swapQuoting ? "Getting quote..." : "Get Quote"}
            </button>

            {swapQuote && (
              (() => {
                const tokenOut = (presets as Record<string, any>)[swapTokenOut];
                const outAmount = tokenOut ? Amount.fromRaw(swapQuote.amountOutBase, tokenOut) : null;
                const outUnit = outAmount?.toUnit();
                const outNumber = outUnit ? Number(outUnit) : null;
                const outDisplay =
                  outNumber !== null && Number.isFinite(outNumber) ? outNumber.toFixed(2) : outUnit ?? "—";

                const impactBps = swapQuote.priceImpactBps ?? null;
                const impactPercent = impactBps === null ? null : Number(impactBps) / 100;

                const impactDisplay =
                  impactPercent !== null && Number.isFinite(impactPercent) ? impactPercent.toFixed(2) : "—";

                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
                    <p className="font-semibold text-gray-900">
                      You&apos;ll receive approximately {outDisplay} {swapTokenOut}
                    </p>
                    <p className="text-gray-700">
                      Price impact: <span className="font-semibold">{impactDisplay}%</span>
                    </p>
                  </div>
                );
              })()
            )}

            {swapQuote && (
              <button
                type="button"
                onClick={handleExecute}
                disabled={status === "executing" || !amountOk}
                className="w-full h-14 bg-amber-500 text-white text-lg font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40 min-h-[44px]"
              >
                {status === "executing" ? "Executing..." : "Execute Swap"}
              </button>
            )}
          </div>
        )}

        {action !== "swap" && (
          <button
            type="button"
            onClick={handleExecute}
            disabled={
              status === "executing" ||
              (action === "borrow" && !canExecuteBorrow) ||
              (action !== "borrow" && !canExecuteNonBorrow)
            }
            className="w-full h-14 bg-amber-500 text-white text-lg font-semibold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40 min-h-[44px]"
          >
            {status === "executing" ? "Executing..." : `Execute ${action.charAt(0).toUpperCase() + action.slice(1)}`}
          </button>
        )}

        {status === "success" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-2">
            <p className="text-green-700 font-medium">Transaction confirmed!</p>
            {txHash && (
              <a
                href={voyagerTxUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-green-600 underline break-all"
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
