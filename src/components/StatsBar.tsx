import { formatUSD, formatTokenAmount } from "../lib/tokens";
import type { LendingPositionState } from "../hooks/useLendingPosition";
import type { Token } from "starkzap";

interface Props {
  position: LendingPositionState;
  collateralToken: Token;
  debtToken: Token;
  maxBorrow: bigint;
}

function StatItem({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="stat-item">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function healthColor(r: number) {
  if (!isFinite(r) || r > 1.5) return "var(--green)";
  if (r >= 1.2) return "var(--amber)";
  return "var(--red)";
}

export function StatsBar({ position, collateralToken, debtToken, maxBorrow }: Props) {
  const hasPosition = position.collateralAmount > 0n || position.debtAmount > 0n;

  const ltv = position.collateralValue > 0n
    ? ((Number(position.debtValue) / Number(position.collateralValue)) * 100).toFixed(1) + "%"
    : "—";

  const healthStr = !isFinite(position.healthRatio) || position.healthRatio === 0
    ? "∞"
    : position.healthRatio.toFixed(2) + "x";

  const maxBorrowFmt = maxBorrow > 0n
    ? formatTokenAmount(maxBorrow, debtToken.decimals, 2) + " " + debtToken.symbol
    : "—";

  return (
    <div className="stats-bar">
      <StatItem
        label="Health Ratio"
        value={
          <span style={{ color: healthColor(position.healthRatio), fontWeight: 800 }}>
            {healthStr}
          </span>
        }
      />
      <div className="stat-divider" />
      <StatItem
        label="Collateral"
        value={hasPosition ? formatUSD(position.collateralValue) : "—"}
        sub={hasPosition ? formatTokenAmount(position.collateralAmount, collateralToken.decimals, 4) + " " + collateralToken.symbol : undefined}
      />
      <div className="stat-divider" />
      <StatItem
        label="Debt"
        value={hasPosition ? formatUSD(position.debtValue) : "—"}
        sub={hasPosition ? formatTokenAmount(position.debtAmount, debtToken.decimals, 2) + " " + debtToken.symbol : undefined}
      />
      <div className="stat-divider" />
      <StatItem label="LTV" value={ltv} />
      <div className="stat-divider" />
      <StatItem label="Max Borrow" value={maxBorrowFmt} />
    </div>
  );
}
