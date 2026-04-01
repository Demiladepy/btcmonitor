import { Wallet, Zap, ShieldCheck, Bell, Activity } from "lucide-react";
import type { WalletState } from "../hooks/useWallet";
import { truncateAddress } from "../lib/tokens";
import { Logo } from "./Logo";

interface Props { walletState: WalletState; }

const features = [
  { icon: Activity, label: "Live health ratio with 48-point history" },
  { icon: Zap,      label: "Simulate borrow impact before signing" },
  { icon: ShieldCheck, label: "Hard-blocked if action triggers liquidation" },
  { icon: Bell,     label: "Telegram & email alerts at your threshold" },
];

export function WalletConnect({ walletState }: Props) {
  const { isConnected, isConnecting, connect, disconnect, address, error } = walletState;

  if (isConnected && address) {
    return (
      <button className="wallet-btn" onClick={disconnect}>
        <div className="dot dot-orange" />
        <span className="addr">{truncateAddress(address)}</span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>✕</span>
      </button>
    );
  }

  if (isConnecting) {
    return (
      <div className="connect-screen">
        <div className="connect-card">
          <div className="connect-logo"><Logo size={52} /></div>
          <div className="connect-title">BTC Health Monitor</div>
          <div className="connect-subtitle" style={{ marginBottom: 24 }}>Connecting to Sepolia…</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="connect-screen">
        <div className="connect-card">
          <div className="connect-logo" style={{ fontSize: 40 }}>⚠️</div>
          <div className="connect-title">Connection Failed</div>
          <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
            {error.message.length > 140 ? error.message.slice(0, 140) + "…" : error.message}
          </div>
          <button className="connect-btn-primary" onClick={connect}>
            <Wallet size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="connect-screen">
      <div className="connect-card">
        <div className="connect-logo"><Logo size={52} /></div>

        <div className="connect-title">BTC Health Monitor</div>
        <div className="connect-subtitle">
          DeFi risk management for Vesu lending on Starknet.<br />
          Know your health. Act before liquidation.
        </div>

        {/* Feature list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32, textAlign: "left" }}>
          {features.map(({ icon: Icon, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text2)" }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "var(--accent-dim)", border: "1px solid rgba(247,147,26,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={13} color="var(--accent)" />
              </div>
              {label}
            </div>
          ))}
        </div>

        <button className="connect-btn-primary" onClick={connect}>
          <Wallet size={17} />
          Launch Demo Wallet
        </button>

        <div className="connect-footer">
          <div className="dot dot-green" style={{ width: 6, height: 6 }} />
          Starknet Sepolia · Starkzap v2 · Vesu Protocol
        </div>
      </div>
    </div>
  );
}
