import { useState } from "react";
import { Amount } from "starkzap";
import type { Wallet, Token, Address } from "starkzap";
import { useQuoteHealth } from "../hooks/useQuoteHealth";
import { useMaxBorrow } from "../hooks/useMaxBorrow";
import { HealthGauge } from "./HealthGauge";
import { formatTokenAmount } from "../lib/tokens";
import type { useToast } from "../hooks/useToast";

interface Props {
  wallet: Wallet;
  collateralToken: Token;
  debtToken: Token;
  poolAddress: string | null;
  currentHealthRatio: number;
  onActionComplete: () => void;
  toast: ReturnType<typeof useToast>;
}

type Tab = "borrow" | "repay";

function healthColor(r: number) {
  if (!isFinite(r) || r > 1.5) return "var(--green)";
  if (r >= 1.2) return "var(--amber)";
  return "var(--red)";
}
function healthLabel(r: number) {
  if (!isFinite(r)) return "Safe (no debt)";
  if (r > 1.5) return "Safe";
  if (r >= 1.2) return "At Risk";
  return "Danger";
}

export function BorrowSimulator({
  wallet, collateralToken, debtToken, poolAddress,
  currentHealthRatio, onActionComplete, toast,
}: Props) {
  const [tab, setTab] = useState<Tab>("borrow");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);

  const quote = useQuoteHealth(wallet, collateralToken, debtToken, tab, amount, poolAddress);
  const { maxBorrow } = useMaxBorrow(wallet, collateralToken, debtToken, poolAddress);

  const showProjected = !!amount && parseFloat(amount) > 0;
  const projRatio = showProjected && !quote.loading ? quote.projectedHealth : undefined;
  const gaugeRatio = showProjected && !quote.loading ? quote.currentHealth : currentHealthRatio;

  function setMax() {
    if (maxBorrow > 0n) {
      // Use 95% of max to avoid edge failures
      const safeMax = (maxBorrow * 95n) / 100n;
      setAmount(formatTokenAmount(safeMax, debtToken.decimals, 6));
    }
  }

  async function handleAction() {
    if (!amount || parseFloat(amount) <= 0 || !poolAddress) return;
    setPending(true);
    const toastId = toast.add("pending", tab === "borrow" ? `Borrowing ${amount} ${debtToken.symbol}…` : `Repaying ${amount} ${debtToken.symbol}…`);
    try {
      const pool = poolAddress as Address;
      const parsed = Amount.parse(amount, debtToken);
      const tx = tab === "borrow"
        ? await wallet.lending().borrow(
            { collateralToken, debtToken, amount: parsed, poolAddress: pool },
            { feeMode: "sponsored" }
          )
        : await wallet.lending().repay(
            { collateralToken, debtToken, amount: parsed, poolAddress: pool }
          );
      toast.update(toastId, "pending", "Waiting for confirmation…");
      await tx.wait();
      toast.update(toastId, "success",
        tab === "borrow"
          ? `Borrowed ${amount} ${debtToken.symbol} ✓`
          : `Repaid ${amount} ${debtToken.symbol} ✓`
      );
      setAmount("");
      onActionComplete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.update(toastId, "error", msg.length > 80 ? msg.slice(0, 80) + "…" : msg);
    } finally {
      setPending(false);
    }
  }

  const disabled = pending || !amount || parseFloat(amount) <= 0 || !poolAddress;

  return (
    <div className="card sim-card">
      <div className="card-title">Simulate &amp; Execute</div>

      <div className="tabs">
        <button className={`tab ${tab === "borrow" ? "tab-active" : ""}`}
          onClick={() => { setTab("borrow"); setAmount(""); }}>Borrow</button>
        <button className={`tab ${tab === "repay" ? "tab-active" : ""}`}
          onClick={() => { setTab("repay"); setAmount(""); }}>Repay</button>
      </div>

      <div className="sim-body">
        <div className="input-group">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="input-label">Amount</div>
            {tab === "borrow" && maxBorrow > 0n && (
              <button className="btn-ghost small" onClick={setMax} style={{ fontSize: 11 }}>
                Max {formatTokenAmount(maxBorrow, debtToken.decimals, 2)}
              </button>
            )}
          </div>
          <div className="amount-wrap">
            <input
              type="number" className="amount-input"
              min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            <div className="amount-token">{debtToken.symbol}</div>
          </div>
        </div>

        {showProjected && (
          <div className="projected-health">
            <span className="label">Projected health</span>
            <span className="value" style={{ color: healthColor(quote.projectedHealth) }}>
              {quote.loading ? "…" : isFinite(quote.projectedHealth) ? quote.projectedHealth.toFixed(2) + "x" : "∞"}
            </span>
          </div>
        )}

        <div className="gauge-center">
          <HealthGauge healthRatio={gaugeRatio} projectedRatio={projRatio} size={160} />
        </div>

        {showProjected && !quote.loading && !quote.error && (
          <div className="action-result">
            After this action:{" "}
            <strong style={{ color: healthColor(quote.projectedHealth) }}>
              {healthLabel(quote.projectedHealth)}
            </strong>
          </div>
        )}

        <button className="btn-primary btn-full" onClick={handleAction} disabled={disabled}>
          {pending
            ? <><span className="spinner-sm" />Confirming…</>
            : tab === "borrow"
              ? `Borrow ${amount || "0"} ${debtToken.symbol}`
              : `Repay ${amount || "0"} ${debtToken.symbol}`}
        </button>

        {tab === "borrow" && (
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
            ⛽ Gasless via AVNU paymaster
          </div>
        )}
      </div>
    </div>
  );
}
