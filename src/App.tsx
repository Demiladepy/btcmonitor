import { useWallet } from "./hooks/useWallet";
import { WalletConnect } from "./components/WalletConnect";
import { Dashboard } from "./components/Dashboard";
import "./index.css";

function App() {
  const walletState = useWallet();

  if (walletState.isConnected) {
    return <Dashboard walletState={walletState} />;
  }

  return <WalletConnect walletState={walletState} />;
}

export default App;
