import type { Token } from "starkzap";
import type { LendingPositionState } from "../hooks/useLendingPosition";
import { formatTokenAmount, formatUSD } from "../lib/tokens";

interface Props {
  collateralToken: Token;
  debtToken: Token;
  position: LendingPositionState;
}

function healthPill(ratio: number) {
  if (!isFinite(ratio) || ratio === 0) return { label: "No Position", cls: "pill-green" };
  if (ratio > 1.5) return { label: "Safe", cls: "pill-green" };
  if (ratio >= 1.2) return { label: "At Risk", cls: "pill-amber" };
  return { label: "Danger", cls: "pill-red" };
}

function liquidationPrice(
  debtValue: bigint,
  collateralAmount: bigint,
  decimals: number
): string {
  if (debtValue === 0n || collateralAmount === 0n) return "—";
  const debtUSD = Number(debtValue) / 1e18;
  const colAmount = Number(collateralAmount) / 10 ** decimals;
  return `$${(debtUSD / colAmount).toFixed(2)}`;
}

export function PositionCard({ collateralToken, debtToken, position }: Props) {
  const pill = healthPill(position.healthRatio);
  const hasPosition = position.collateralAmount > 0n || position.debtAmount > 0n;

  return (
    <div className="card position-card">
      <div className="pos-header">
        <span className="pos-pair">
          {collateralToken.symbol} <span style={{ color: "var(--muted)" }}>/</span> {debtToken.symbol}
        </span>
        <span className="badge">Vesu</span>
        <span className={`pill ${pill.cls}`}>{pill.label}</span>
        <div className={`dot ${position.isCollateralized || !hasPosition ? "dot-green" : "dot-red"}`} title={position.isCollateralized ? "Collateralized" : "Under-collateralized"} />
      </div>

      {!hasPosition ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text2)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No active position</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Deposit collateral below to get started</div>
        </div>
      ) : (
        <div className="pos-rows">
          <div className="pos-row">
            <span className="pos-row-label">Supplied</span>
            <span className="pos-row-amount">
              {formatTokenAmount(position.collateralAmount, collateralToken.decimals)} {collateralToken.symbol}
            </span>
            <span className="pos-row-usd">{formatUSD(position.collateralValue)}</span>
          </div>
          <div className="pos-row">
            <span className="pos-row-label">Borrowed</span>
            <span className="pos-row-amount">
              {formatTokenAmount(position.debtAmount, debtToken.decimals)} {debtToken.symbol}
            </span>
            <span className="pos-row-usd">{formatUSD(position.debtValue)}</span>
          </div>
          <div className="pos-row">
            <span className="pos-row-label">Liq. price</span>
            <span className="pos-row-amount">
              {liquidationPrice(position.debtValue, position.collateralAmount, collateralToken.decimals)}
            </span>
            <span className="pos-row-usd">per {collateralToken.symbol}</span>
          </div>
        </div>
      )}
    </div>
  );
}
