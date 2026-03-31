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
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  const quote = useQuoteHealth(wallet, collateralToken, debtToken, tab, amount, poolAddress);
  const { maxBorrow } = useMaxBorrow(wallet, collateralToken, debtToken, poolAddress);

  const showProjected = !!amount && parseFloat(amount) > 0;
  const projRatio = showProjected && !quote.loading ? quote.projectedHealth : undefined;
  const gaugeRatio = showProjected && !quote.loading ? quote.currentHealth : currentHealthRatio;

  // Reset risk acknowledgement whenever amount changes
  function onAmountChange(val: string) {
    setAmount(val);
    setRiskAcknowledged(false);
  }

  function setMax() {
    setRiskAcknowledged(false);
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

  const baseDisabled = pending || !amount || parseFloat(amount) <= 0 || !poolAddress;

  const proj = showProjected && !quote.loading ? quote.projectedHealth : null;
  const isSafe      = proj === null || proj > 1.5;
  const isWarning   = proj !== null && proj > 1.2 && proj <= 1.5;
  const isDanger    = proj !== null && proj > 1.0 && proj <= 1.2;
  const isLiquidation = proj !== null && proj <= 1.0;

  function renderConfirmButton() {
    if (pending) {
      return (
        <button className="btn-primary btn-full" disabled>
          <span className="spinner-sm" />Confirming…
        </button>
      );
    }

    // Simulation in flight — block confirm
    if (showProjected && quote.loading) {
      return (
        <button className="btn-primary btn-full" disabled>
          Simulating impact…
        </button>
      );
    }

    // Would immediately liquidate — hard block
    if (tab === "borrow" && isLiquidation) {
      return (
        <div style={{ background: "var(--red-dim)", border: "1px solid var(--red)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 600, marginBottom: 4 }}>
            ⛔ Transaction blocked
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Projected health {proj!.toFixed(3)}x — this borrow would trigger immediate liquidation.
          </div>
        </div>
      );
    }

    // Danger zone — require explicit acknowledgement
    if (tab === "borrow" && isDanger && !riskAcknowledged) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "var(--red-dim)", border: "1px solid var(--red)", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "var(--red)" }}>
            ⚠️ Projected health {proj!.toFixed(3)}x — a 5% market move could trigger liquidation.
          </div>
          <button
            className="btn-full"
            onClick={() => setRiskAcknowledged(true)}
            style={{ border: "1px solid var(--red)", color: "var(--red)", background: "transparent", borderRadius: 10, padding: "11px 0", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            I understand the risk — confirm anyway →
          </button>
        </div>
      );
    }

    // Warning zone — show amber notice above normal confirm
    const label = tab === "borrow"
      ? `Borrow ${amount} ${debtToken.symbol}`
      : `Repay ${amount} ${debtToken.symbol}`;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tab === "borrow" && isWarning && (
          <div style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#f59e0b" }}>
            ⚠️ Projected health {proj!.toFixed(3)}x — approaching risk zone. Consider a smaller amount.
          </div>
        )}
        <button
          className="btn-primary btn-full"
          onClick={handleAction}
          disabled={baseDisabled}
          style={isSafe && proj !== null ? { background: "var(--green)" } : undefined}
        >
          {isSafe && proj !== null
            ? <>{label} <span style={{ opacity: 0.75, fontSize: 11, marginLeft: 6 }}>Health after: {proj.toFixed(3)}x ✓</span></>
            : label}
        </button>
      </div>
    );
  }

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
              onChange={(e) => onAmountChange(e.target.value)}
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

        {renderConfirmButton()}

        {tab === "borrow" && (
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
            ⛽ Gasless via AVNU paymaster
          </div>
        )}
      </div>
    </div>
  );
}
