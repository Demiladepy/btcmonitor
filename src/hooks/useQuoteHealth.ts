import { useState, useEffect, useRef } from "react";
import { Amount } from "starkzap";
import type { Wallet, Token, Address } from "starkzap";

interface QuoteState {
  currentHealth: number;
  projectedHealth: number;
  loading: boolean;
  error: Error | null;
}

function isNoPosition(e: unknown): boolean {
  const s = String(e).toLowerCase();
  return s.includes("asset-config-nonexistent") || s.includes("nonexistent") || s.includes("not found");
}

export function useQuoteHealth(
  wallet: Wallet | null,
  collateralToken: Token,
  debtToken: Token,
  action: "borrow" | "repay",
  amount: string,
  poolAddress: string | null
): QuoteState {
  const [state, setState] = useState<QuoteState>({
    currentHealth: Infinity,
    projectedHealth: Infinity,
    loading: false,
    error: null,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!wallet || !poolAddress || !amount || parseFloat(amount) <= 0) {
      setState((s) => ({ ...s, loading: false, error: null }));
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const pool = poolAddress as unknown as Address;
        const parsed = Amount.parse(amount, debtToken);
        const quote = await wallet.lending().quoteHealth({
          action: {
            action,
            request: { collateralToken, debtToken, amount: parsed, poolAddress: pool },
          },
          health: { collateralToken, debtToken, poolAddress: pool },
          feeMode: "sponsored",
        });

        const toRatio = (cv: bigint, dv: bigint) =>
          dv === 0n ? Infinity : Number(cv) / Number(dv);

        const currentHealth = toRatio(quote.current.collateralValue, quote.current.debtValue);
        const projectedHealth = quote.projected
          ? toRatio(quote.projected.collateralValue, quote.projected.debtValue)
          : currentHealth;

        setState({ currentHealth, projectedHealth, loading: false, error: null });
      } catch (e) {
        if (isNoPosition(e)) {
          // No position yet — projected health is Infinity (safe)
          setState({ currentHealth: Infinity, projectedHealth: Infinity, loading: false, error: null });
        } else {
          setState((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e : new Error(String(e)),
          }));
        }
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [wallet, collateralToken, debtToken, action, amount, poolAddress]);

  return state;
}
