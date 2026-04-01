import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useActiveMarket } from "../hooks/useActiveMarket";
import { useLendingPosition } from "../hooks/useLendingPosition";
import { useToast } from "../hooks/useToast";
import { BorrowSimulator } from "../components/BorrowSimulator";
import { DepositWithdrawPanel } from "../components/DepositWithdrawPanel";
import { ToastContainer } from "../components/Toast";
import type { WalletState } from "../hooks/useWallet";
import { COLLATERAL_TOKEN, DEBT_TOKEN } from "../lib/tokens";

interface Props { walletState: WalletState; }

export function TransactPage({ walletState }: Props) {
  const { wallet } = walletState;
  const [collateralToken] = useState(COLLATERAL_TOKEN);
  const [debtToken] = useState(DEBT_TOKEN);
  const toast = useToast();

  const { poolAddress, loading: marketsLoading } = useActiveMarket(wallet, collateralToken, debtToken);
  const position = useLendingPosition(wallet, collateralToken, debtToken, poolAddress);

  if (!wallet) return null;

  return (
    <div className="dashboard">
      <ToastContainer toasts={toast.toasts} remove={toast.remove} />

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
        <Link to="/dashboard" className="header-nav-btn">
          <ArrowLeft size={13} />
          Back
        </Link>
      </header>

      <div style={{ maxWidth: 540, margin: "32px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 20, margin: "0 0 4px" }}>Transact</h2>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Borrow, repay, deposit, or withdraw from your Vesu position
          </div>
        </div>

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
          </>
        )}
      </div>
    </div>
  );
}
