import { Routes, Route, Navigate } from "react-router-dom";
import { useWallet } from "./hooks/useWallet";
import { WalletConnect } from "./components/WalletConnect";
import { Dashboard } from "./components/Dashboard";
import { TransactPage } from "./legacy-pages/TransactPage";
import { AlertsPage } from "./legacy-pages/AlertsPage";
import { PositionDetailPage } from "./legacy-pages/PositionDetailPage";
import "./index.css";

function App() {
  const walletState = useWallet();

  if (!walletState.isConnected) {
    return <WalletConnect walletState={walletState} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard walletState={walletState} />} />
      <Route path="/dashboard/transact" element={<TransactPage walletState={walletState} />} />
      <Route path="/dashboard/alerts" element={<AlertsPage walletState={walletState} />} />
      <Route path="/dashboard/positions/:id" element={<PositionDetailPage walletState={walletState} />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
