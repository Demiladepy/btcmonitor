import type { WalletState } from "../hooks/useWallet";
import { truncateAddress } from "../lib/tokens";

interface Props {
  walletState: WalletState;
}

export function WalletConnect({ walletState }: Props) {
  const { isConnected, isConnecting, connect, disconnect, address, error } = walletState;

  // In-header badge when connected
  if (isConnected && address) {
    return (
      <button className="wallet-btn" onClick={disconnect}>
        <div className="dot dot-green" />
        <span className="addr">{truncateAddress(address)}</span>
        <span style={{ color: "var(--muted)", fontSize: 11 }}>✕</span>
      </button>
    );
  }

  // Connecting spinner
  if (isConnecting) {
    return (
      <div className="connect-screen">
        <div className="connect-card">
          <div className="connect-logo">₿</div>
          <div className="connect-title">BTC Health Monitor</div>
          <div className="connect-subtitle">Connecting to Sepolia…</div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <div className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  // Error with retry
  if (error) {
    return (
      <div className="connect-screen">
        <div className="connect-card">
          <div className="connect-logo">⚠️</div>
          <div className="connect-title">Connection failed</div>
          <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
            {error.message.length > 140 ? error.message.slice(0, 140) + "…" : error.message}
          </div>
          <button className="btn-primary btn-full" onClick={connect}>Retry</button>
        </div>
      </div>
    );
  }

  // Landing
  return (
    <div className="connect-screen">
      <div className="connect-card">
        <div className="connect-logo">₿</div>
        <div className="connect-title">BTC Health Monitor</div>
        <div className="connect-subtitle">
          Monitor Vesu lending positions on Starknet.<br />
          Simulate borrow &amp; repay before signing. Get alerts before liquidation.
        </div>

        <button className="connect-btn-primary" onClick={connect}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Connect Demo Wallet
        </button>

        <div className="connect-footer">
          Starknet Sepolia testnet · Powered by Starkzap v2 + Vesu
        </div>
      </div>
    </div>
  );
}
