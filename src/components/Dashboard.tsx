import { useRef, useState } from "react";
import type { Token } from "starkzap";
import { useLendingPosition } from "../hooks/useLendingPosition";
import { useAlerts } from "../hooks/useAlerts";
import { useHealthHistory } from "../hooks/useHealthHistory";
import { HealthGauge } from "./HealthGauge";
import { PositionCard } from "./PositionCard";
import { BorrowSimulator } from "./BorrowSimulator";
import { DepositWithdrawPanel } from "./DepositWithdrawPanel";
import { AlertBanner } from "./AlertBanner";
import { AlertSettings } from "./AlertSettings";
import { MarketPanel } from "./MarketPanel";
import { HealthHistoryChart } from "./HealthHistoryChart";
import { WalletConnect } from "./WalletConnect";
import type { WalletState } from "../hooks/useWallet";
import { COLLATERAL_TOKEN, DEBT_TOKEN, formatUSD } from "../lib/tokens";

interface Props {
  walletState: WalletState;
}

function healthColor(ratio: number): string {
  if (!isFinite(ratio) || ratio > 1.5) return "var(--green)";
  if (ratio >= 1.2) return "var(--amber)";
  return "var(--red)";
}

export function Dashboard({ walletState }: Props) {
  const { wallet } = walletState;
  const [collateralToken, setCollateralToken] = useState<Token>(COLLATERAL_TOKEN);
  const [debtToken] = useState<Token>(DEBT_TOKEN);
  const repayRef = useRef<HTMLDivElement>(null);

  const position = useLendingPosition(wallet, collateralToken, debtToken);
  const { alertActive, threshold, setThreshold, dismissAlert } = useAlerts(position.healthRatio);
  const { history } = useHealthHistory(position.healthRatio);

  if (!wallet) return null;

  const ratioLabel = !isFinite(position.healthRatio) || position.healthRatio === 0
    ? "∞"
    : position.healthRatio.toFixed(2) + "x";

  return (
    <div className="dashboard">
      <AlertBanner
        alertActive={alertActive}
        healthRatio={position.healthRatio}
        threshold={threshold}
        onDismiss={dismissAlert}
        onRepay={() => { dismissAlert(); repayRef.current?.scrollIntoView({ behavior: "smooth" }); }}
      />

      {/* Header */}
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

        <WalletConnect walletState={walletState} />
      </header>

      <div className="dash-body">
        {/* LEFT COLUMN */}
        <div className="dash-left">

          {/* Health Hero Card */}
          <div className="health-hero">
            <div className="hero-gauge">
              <HealthGauge healthRatio={position.healthRatio} size={180} />
            </div>
            <div className="hero-stats">
              <div>
                <div className="hero-stat-label">Collateral value</div>
                <div className="hero-stat-value">
                  {formatUSD(position.collateralValue)}
                </div>
              </div>
              <div>
                <div className="hero-stat-label">Debt value</div>
                <div className="hero-stat-value">
                  {formatUSD(position.debtValue)}
                </div>
              </div>
              <div className="hero-meta">
                <span className="badge">
                  <div className="dot dot-green" />
                  {collateralToken.symbol}/{debtToken.symbol}
                </span>
                <span className="badge">Vesu</span>
                {position.loading && (
                  <span className="badge"><span className="spinner-sm" />Refreshing</span>
                )}
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
            wallet={wallet}
            activeCollateral={collateralToken}
            activeDebt={debtToken}
            onSelectMarket={(c) => setCollateralToken(c)}
          />
        </div>

        {/* RIGHT COLUMN */}
        <div className="dash-right" ref={repayRef}>
          <BorrowSimulator
            wallet={wallet}
            collateralToken={collateralToken}
            debtToken={debtToken}
            currentHealthRatio={position.healthRatio}
            onActionComplete={position.refresh}
          />
          <DepositWithdrawPanel
            wallet={wallet}
            collateralToken={collateralToken}
            onComplete={position.refresh}
          />
        </div>
      </div>
    </div>
  );
}
