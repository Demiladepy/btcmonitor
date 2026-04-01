import { useState, useEffect } from "react";
import type { Wallet, Token, LendingMarket } from "starkzap";

export interface ActiveMarket {
  collateralMarket: LendingMarket | null;
  debtMarket: LendingMarket | null;
  poolAddress: string | null;
  allMarkets: LendingMarket[];
  loading: boolean;
  error: Error | null;
}

/**
 * Finds the best pool that supports both collateralToken and debtToken.
 * Strategy: for each pool that has an ETH market, check if the same pool
 * also has a USDC (canBeBorrowed) market. Return the first match.
 */
export function useActiveMarket(
  wallet: Wallet | null,
  collateralToken: Token,
  debtToken: Token
): ActiveMarket {
  const [state, setState] = useState<ActiveMarket>({
    collateralMarket: null,
    debtMarket: null,
    poolAddress: null,
    allMarkets: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!wallet) return;
    // Reset poolAddress immediately so useLendingPosition doesn't query
    // the OLD pool with the NEW tokens while discovery is in flight.
    setState({
      collateralMarket: null,
      debtMarket: null,
      poolAddress: null,
      allMarkets: [],
      loading: true,
      error: null,
    });

    wallet
      .lending()
      .getMarkets()
      .then((markets) => {
        console.log("[BTC Health] Markets:", markets.map((m) => `${m.poolAddress.slice(0, 8)}…${m.asset.symbol}`));

        // Group markets by poolAddress
        const byPool = new Map<string, LendingMarket[]>();
        for (const m of markets) {
          const key = m.poolAddress.toLowerCase();
          if (!byPool.has(key)) byPool.set(key, []);
          byPool.get(key)!.push(m);
        }

        // Find a pool that has both collateral token AND a borrowable debt token
        let best: { pool: string; col: LendingMarket; debt: LendingMarket } | null = null;

        for (const [pool, poolMarkets] of byPool) {
          const colMarket = poolMarkets.find(
            (m) => m.asset.address.toLowerCase() === collateralToken.address.toLowerCase()
          );
          const debtMarket = poolMarkets.find(
            (m) =>
              m.asset.address.toLowerCase() === debtToken.address.toLowerCase() &&
              m.canBeBorrowed !== false
          );
          if (colMarket && debtMarket) {
            best = { pool, col: colMarket, debt: debtMarket };
            break;
          }
        }

        // Fallback: find any pool with just the collateral token
        if (!best) {
          for (const [pool, poolMarkets] of byPool) {
            const colMarket = poolMarkets.find(
              (m) => m.asset.address.toLowerCase() === collateralToken.address.toLowerCase()
            );
            if (colMarket) {
              best = { pool, col: colMarket, debt: colMarket };
              break;
            }
          }
        }

        if (best) {
          console.log("[BTC Health] Active pool:", best.pool, `${best.col.asset.symbol}/${best.debt.asset.symbol}`);
        } else {
          console.warn("[BTC Health] No matching pool found for", collateralToken.symbol, "/", debtToken.symbol);
        }

        setState({
          collateralMarket: best?.col ?? null,
          debtMarket: best?.debt ?? null,
          poolAddress: best?.pool ?? null,
          allMarkets: markets,
          loading: false,
          error: null,
        });
      })
      .catch((e) => {
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
      });
  }, [wallet, collateralToken.address, debtToken.address]);

  return state;
}
