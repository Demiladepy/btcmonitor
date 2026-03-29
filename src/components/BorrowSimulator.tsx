import { useState } from "react";
import { Amount } from "starkzap";
import type { Wallet, Token } from "starkzap";
import { useQuoteHealth } from "../hooks/useQuoteHealth";
import { HealthGauge } from "./HealthGauge";

interface Props {
  wallet: Wallet;
  collateralToken: Token;
  debtToken: Token;
  currentHealthRatio: number;
  onActionComplete: () => void;
}

type Tab = "borrow" | "repay";

function healthLabel(ratio: number): string {
  if (!isFinite(ratio)) return "Safe (no debt)";
  if (ratio > 1.5) return "Safe";
  if (ratio >= 1.2) return "At Risk";
  return "Danger";
}
function healthColor(ratio: number): string {
  if (!isFinite(ratio) || ratio > 1.5) return "var(--green)";
  if (ratio >= 1.2) return "var(--amber)";
  return "var(--red)";
}

export function BorrowSimulator({
  wallet, collateralToken, debtToken, currentHealthRatio, onActionComplete,
}: Props) {
  const [tab, setTab] = useState<Tab>("borrow");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const quote = useQuoteHealth(wallet, collateralToken, debtToken, tab, amount);
  const showProjected = !!amount && parseFloat(amount) > 0;
  const projRatio = showProjected && !quote.loading ? quote.projectedHealth : undefined;
  const displayRatio = showProjected && !quote.loading ? quote.currentHealth : currentHealthRatio;

  async function handleAction() {
    if (!amount || parseFloat(amount) <= 0) return;
    setPending(true);
    setTxError(null);
    try {
      const parsed = Amount.parse(amount, debtToken);
      const tx = tab === "borrow"
        ? await wallet.lending().borrow({ collateralToken, debtToken, amount: parsed }, { feeMode: "sponsored" })
        : await wallet.lending().repay({ collateralToken, debtToken, amount: parsed });
      await tx.wait();
      setAmount("");
      onActionComplete();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card sim-card">
      <div className="card-title">Simulate</div>

      <div className="tabs">
        <button className={`tab ${tab === "borrow" ? "tab-active" : ""}`} onClick={() => setTab("borrow")}>Borrow</button>
        <button className={`tab ${tab === "repay" ? "tab-active" : ""}`} onClick={() => setTab("repay")}>Repay</button>
      </div>

      <div className="sim-body">
        <div className="input-group">
          <div className="input-label">Amount</div>
          <div className="amount-wrap">
            <input
              type="number"
              className="amount-input"
              min="0" step="0.01"
              value={amount}
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
          <HealthGauge healthRatio={displayRatio} projectedRatio={projRatio} size={150} />
        </div>

        {showProjected && !quote.loading && !quote.error && (
          <div className="action-result">
            After this action: <strong style={{ color: healthColor(quote.projectedHealth) }}>{healthLabel(quote.projectedHealth)}</strong>
          </div>
        )}

        <button
          className="btn-primary btn-full"
          onClick={handleAction}
          disabled={pending || !amount || parseFloat(amount) <= 0}
        >
          {pending ? (
            <><span className="spinner-sm" />Confirming…</>
          ) : tab === "borrow" ? (
            `Borrow ${amount || "0"} ${debtToken.symbol}`
          ) : (
            `Repay ${amount || "0"} ${debtToken.symbol}`
          )}
        </button>
        {tab === "borrow" && <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)" }}>Gasless via AVNU paymaster</div>}

        {txError && <p className="error-text">{txError}</p>}
      </div>
    </div>
  );
}
