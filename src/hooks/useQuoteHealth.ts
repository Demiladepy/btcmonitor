import { useState, useEffect, useRef } from "react";
import { Amount } from "starkzap";
import type { Wallet, Token } from "starkzap";

interface QuoteHealthState {
  currentHealth: number;
  projectedHealth: number;
  simulation: unknown;
  loading: boolean;
  error: Error | null;
}

export function useQuoteHealth(
  wallet: Wallet | null,
  collateralToken: Token,
  debtToken: Token,
  action: "borrow" | "repay",
  amount: string
): QuoteHealthState {
  const [state, setState] = useState<QuoteHealthState>({
    currentHealth: Infinity,
    projectedHealth: Infinity,
    simulation: null,
    loading: false,
    error: null,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!wallet || !amount || parseFloat(amount) <= 0) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const parsedAmount = Amount.parse(amount, debtToken);
        const quote = await wallet.lending().quoteHealth({
          action: {
            action,
            request: { collateralToken, debtToken, amount: parsedAmount },
          },
          health: { collateralToken, debtToken },
          feeMode: "sponsored",
        });

        const currentDebt = quote.current.debtValue;
        const currentCollateral = quote.current.collateralValue;
        const currentHealth =
          currentDebt === 0n
            ? Infinity
            : Number(currentCollateral) / Number(currentDebt);

        let projectedHealth = currentHealth;
        if (quote.projected) {
          const projDebt = quote.projected.debtValue;
          const projCollateral = quote.projected.collateralValue;
          projectedHealth =
            projDebt === 0n
              ? Infinity
              : Number(projCollateral) / Number(projDebt);
        }

        setState({
          currentHealth,
          projectedHealth,
          simulation: quote.simulation,
          loading: false,
          error: null,
        });
      } catch (e) {
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [wallet, collateralToken, debtToken, action, amount]);

  return state;
}
