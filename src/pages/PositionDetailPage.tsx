import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Logo } from "../components/Logo";
import { useActiveMarket } from "../hooks/useActiveMarket";
import { useLendingPosition } from "../hooks/useLendingPosition";
import { useHealthHistory } from "../hooks/useHealthHistory";
import { HealthGauge } from "../components/HealthGauge";
import { HealthHistoryChart } from "../components/HealthHistoryChart";
import { PositionCard } from "../components/PositionCard";
import type { WalletState } from "../hooks/useWallet";
import { COLLATERAL_TOKEN, DEBT_TOKEN } from "../lib/tokens";

interface Props { walletState: WalletState; }

export function PositionDetailPage({ walletState }: Props) {
  const { wallet } = walletState;
  const { id } = useParams<{ id: string }>();

  const { poolAddress } = useActiveMarket(wallet, COLLATERAL_TOKEN, DEBT_TOKEN);
  const position = useLendingPosition(wallet, COLLATERAL_TOKEN, DEBT_TOKEN, poolAddress);
  const { history } = useHealthHistory(position.healthRatio);

  if (!wallet) return null;

  const healthColor =
    !isFinite(position.healthRatio) || position.healthRatio === 0
      ? "var(--muted)"
      : position.healthRatio > 1.5
      ? "var(--green)"
      : position.healthRatio >= 1.2
      ? "var(--amber)"
      : "var(--red)";

  return (
    <div className="dashboard">
      <header className="header">
        <div className="header-logo">
          <Logo size={28} />
          <span className="logo-text">BTC Health Monitor</span>
        </div>
        <div className="header-spacer" />
        <div className="network-badge">
          <div className="network-dot" />
          Sepolia
        </div>
        <Link to="/dashboard" className="header-nav-btn">
          <ArrowLeft size={13} />
          Back
        </Link>
      </header>

      <div style={{ maxWidth: 720, margin: "32px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontWeight: 700, fontSize: 20, margin: "0 0 4px" }}>
              Position Detail
            </h2>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {COLLATERAL_TOKEN.symbol} / {DEBT_TOKEN.symbol} on Vesu
              {id && <span style={{ marginLeft: 8 }} className="badge">#{id}</span>}
            </div>
          </div>
          {position.loading && (
            <span className="badge" style={{ gap: 5, display: "flex", alignItems: "center" }}>
              <RefreshCw size={10} style={{ animation: "spin 0.9s linear infinite" }} />
              Refreshing
            </span>
          )}
        </div>

        {/* Health gauge */}
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <HealthGauge healthRatio={position.healthRatio} size={160} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Health Factor</div>
              <div style={{ fontWeight: 700, fontSize: 32, color: healthColor, lineHeight: 1 }}>
                {isFinite(position.healthRatio) && position.healthRatio > 0
                  ? position.healthRatio.toFixed(3)
                  : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Status</div>
              <span className={`pill ${
                !isFinite(position.healthRatio) || position.healthRatio > 1.5
                  ? "pill-green"
                  : position.healthRatio >= 1.2
                  ? "pill-amber"
                  : "pill-red"
              }`}>
                {!isFinite(position.healthRatio) || position.healthRatio === 0
                  ? "No Position"
                  : position.healthRatio > 1.5 ? "Safe"
                  : position.healthRatio >= 1.2 ? "At Risk"
                  : "Danger"}
              </span>
            </div>
            {poolAddress && (
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Pool</div>
                <span className="badge" title={poolAddress}>
                  {poolAddress.slice(2, 6)}…{poolAddress.slice(-4)}
                </span>
              </div>
            )}
          </div>
        </div>

        <PositionCard
          collateralToken={COLLATERAL_TOKEN}
          debtToken={DEBT_TOKEN}
          position={position}
        />

        <HealthHistoryChart history={history} alertThreshold={1.2} />

        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/dashboard/transact" style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, padding: "12px 0", borderRadius: 10,
            background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: 14,
            textDecoration: "none",
          }}>
            Manage Position
          </Link>
          <Link to="/dashboard/alerts" style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, padding: "12px 0", borderRadius: 10,
            border: "1px solid var(--border)", color: "var(--text)", fontWeight: 600, fontSize: 14,
            textDecoration: "none",
          }}>
            Configure Alerts
          </Link>
        </div>
      </div>
    </div>
  );
}
