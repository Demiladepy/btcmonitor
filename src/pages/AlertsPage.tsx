import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "../components/Logo";
import { useLendingPosition } from "../hooks/useLendingPosition";
import { useActiveMarket } from "../hooks/useActiveMarket";
import { useAlerts } from "../hooks/useAlerts";
import { useNotifications } from "../hooks/useNotifications";
import { useYieldAlert } from "../hooks/useYieldAlert";
import { AlertBanner } from "../components/AlertBanner";
import { AlertSettings } from "../components/AlertSettings";
import { NotificationSetup } from "../components/NotificationSetup";
import type { WalletState } from "../hooks/useWallet";
import { COLLATERAL_TOKEN, DEBT_TOKEN } from "../lib/tokens";

interface Props { walletState: WalletState; }

export function AlertsPage({ walletState }: Props) {
  const { wallet } = walletState;

  const { poolAddress } = useActiveMarket(wallet, COLLATERAL_TOKEN, DEBT_TOKEN);
  const position = useLendingPosition(wallet, COLLATERAL_TOKEN, DEBT_TOKEN, poolAddress);
  const notifications = useNotifications();
  const { alertActive, threshold, setThreshold, dismissAlert } = useAlerts(
    position.healthRatio,
    notifications.sendAlert
  );
  useYieldAlert(position.debtAmount, notifications.sendAlert);

  if (!wallet) return null;

  return (
    <div className="dashboard">
      <AlertBanner
        alertActive={alertActive}
        healthRatio={position.healthRatio}
        threshold={threshold}
        onDismiss={dismissAlert}
        onRepay={dismissAlert}
      />

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
        <AlertSettings threshold={threshold} setThreshold={setThreshold} />
        <Link to="/dashboard" className="header-nav-btn">
          <ArrowLeft size={13} />
          Back
        </Link>
      </header>

      <div style={{ maxWidth: 540, margin: "32px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 20, margin: "0 0 4px" }}>Alert Settings</h2>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Configure when and how you get notified about your position
          </div>
        </div>

        {/* Threshold summary card */}
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Health Threshold</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Alert when health ratio drops below{" "}
              <span style={{ color: "var(--amber)", fontWeight: 600 }}>{threshold.toFixed(2)}x</span>
            </div>
          </div>
          <AlertSettings threshold={threshold} setThreshold={setThreshold} />
        </div>

        {/* Position health snapshot */}
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Current Status
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Health Ratio</div>
              <div style={{ fontWeight: 700, fontSize: 22, color: "var(--accent)" }}>
                {isFinite(position.healthRatio) && position.healthRatio > 0
                  ? `${position.healthRatio.toFixed(3)}x`
                  : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>Alert Status</div>
              <div>
                {alertActive ? (
                  <span className="pill pill-red">Active alert</span>
                ) : (
                  <span className="pill pill-green">No active alerts</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <NotificationSetup hook={notifications} />
      </div>
    </div>
  );
}
