import { useState, useEffect } from "react";
import type { LendingMarket } from "starkzap";
import type { Wallet } from "starkzap";

export function useLendingMarkets(wallet: Wallet | null) {
  const [markets, setMarkets] = useState<LendingMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    wallet
      .lending()
      .getMarkets()
      .then((m) => {
        console.log("[BTC Health] Available markets:", m);
        setMarkets(m);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, [wallet]);

  return { markets, loading, error };
}
