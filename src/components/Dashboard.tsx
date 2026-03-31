import { useRef, useState } from "react";
import type { Token } from "starkzap";
import { useActiveMarket } from "../hooks/useActiveMarket";
import { useLendingPosition } from "../hooks/useLendingPosition";
import { useAlerts } from "../hooks/useAlerts";
import { useHealthHistory } from "../hooks/useHealthHistory";
import { useMaxBorrow } from "../hooks/useMaxBorrow";
import { useToast } from "../hooks/useToast";
import { useNotifications } from "../hooks/useNotifications";
import { useYieldAlert } from "../hooks/useYieldAlert";
import { HealthGauge } from "./HealthGauge";
import { PositionCard } from "./PositionCard";
import { BorrowSimulator } from "./BorrowSimulator";
import { DepositWithdrawPanel } from "./DepositWithdrawPanel";
import { AlertBanner } from "./AlertBanner";
import { AlertSettings } from "./AlertSettings";
import { MarketPanel } from "./MarketPanel";
import { HealthHistoryChart } from "./HealthHistoryChart";
import { StatsBar } from "./StatsBar";
import { ToastContainer } from "./Toast";
import { NotificationSetup } from "./NotificationSetup";
import type { WalletState } from "../hooks/useWallet";
import { COLLATERAL_TOKEN, DEBT_TOKEN, truncateAddress } from "../lib/tokens";

interface Props { walletState: WalletState; }

export function Dashboard({ walletState }: Props) {
  const { wallet, address } = walletState;
  const [collateralToken, setCollateralToken] = useState<Token>(COLLATERAL_TOKEN);
  const [debtToken] = useState<Token>(DEBT_TOKEN);
  const repayRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const { poolAddress, allMarkets, loading: marketsLoading } = useActiveMarket(
    wallet, collateralToken, debtToken
  );
  const position = useLendingPosition(wallet, collateralToken, debtToken, poolAddress);
  const { maxBorrow } = useMaxBorrow(wallet, collateralToken, debtToken, poolAddress);
  const notifications = useNotifications();
  const { alertActive, threshold, setThreshold, dismissAlert } = useAlerts(
    position.healthRatio,
    notifications.sendAlert
  );
  useYieldAlert(position.debtAmount, notifications.sendAlert);
  const { history } = useHealthHistory(position.healthRatio);

  if (!wallet) return null;

  return (
    <div className="dashboard">
      <ToastContainer toasts={toast.toasts} remove={toast.remove} />

      <AlertBanner
        alertActive={alertActive}
        healthRatio={position.healthRatio}
        threshold={threshold}
        onDismiss={dismissAlert}
        onRepay={() => { dismissAlert(); repayRef.current?.scrollIntoView({ behavior: "smooth" }); }}
      />

      {/* ── Header ── */}
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-icon">₿</div>
          <span className="logo-text">BTC Health Monitor</span>
        </div>
        <div className="header-spacer" />
        <div className="network-badge">
          <div className="network-dot" />
          Sepolia
        </div>
        <AlertSettings threshold={threshold} setThreshold={setThreshold} />
        {notifications.isConfigured && (
          <span className="pill pill-green" style={{ fontSize: 11, padding: "3px 10px" }}>
            🔔 Alerts active
          </span>
        )}
        <button className="wallet-btn" onClick={walletState.disconnect} title="Disconnect">
          <div className="dot dot-green" />
          <span className="addr">{address ? truncateAddress(address) : "…"}</span>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>✕</span>
        </button>
      </header>

      {/* ── Stats bar ── */}
      <StatsBar
        position={position}
        collateralToken={collateralToken}
        debtToken={debtToken}
        maxBorrow={maxBorrow}
      />

      {/* ── Body ── */}
      <div className="dash-body">

        {/* LEFT */}
        <div className="dash-left">
          {/* Hero */}
          <div className="health-hero">
            <div className="hero-gauge">
              <HealthGauge healthRatio={position.healthRatio} size={190} />
            </div>
            <div className="hero-stats">
              <div>
                <div className="hero-stat-label">
                  {collateralToken.symbol} / {debtToken.symbol} on Vesu
                </div>
              </div>
              <div className="hero-meta" style={{ flexWrap: "wrap", gap: 8 }}>
                {poolAddress ? (
                  <span className="badge" title={poolAddress}>
                    Pool {poolAddress.slice(2, 6)}…{poolAddress.slice(-4)}
                  </span>
                ) : (
                  <span className="badge muted">Finding pool…</span>
                )}
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
                {position.loading && (
                  <span className="badge"><span className="spinner-sm" />Refreshing</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Auto-refreshes every 15s
              </div>
            </div>
          </div>

          <PositionCard
            collateralToken={collateralToken}
            debtToken={debtToken}
            position={position}
          />

          <HealthHistoryChart history={history} alertThreshold={threshold} />

          <MarketPanel
            markets={allMarkets}
            loading={marketsLoading}
            activeCollateral={collateralToken}
            activeDebt={debtToken}
            activePool={poolAddress}
            onSelectMarket={(token) => setCollateralToken(token)}
          />
        </div>

        {/* RIGHT */}
        <div className="dash-right" ref={repayRef}>
          {marketsLoading && !poolAddress ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
              <div className="spinner" style={{ margin: "0 auto 16px" }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Connecting to Vesu</div>
              <div className="muted small">Discovering available markets…</div>
            </div>
          ) : (
            <>
              <BorrowSimulator
                wallet={wallet}
                collateralToken={collateralToken}
                debtToken={debtToken}
                poolAddress={poolAddress}
                currentHealthRatio={position.healthRatio}
                onActionComplete={position.refresh}
                toast={toast}
              />
              <DepositWithdrawPanel
                wallet={wallet}
                collateralToken={collateralToken}
                poolAddress={poolAddress}
                onComplete={position.refresh}
                toast={toast}
              />
              <NotificationSetup hook={notifications} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
