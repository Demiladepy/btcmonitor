import { useState, useEffect, useCallback, useRef } from "react";
import type { Wallet, Token, Address } from "starkzap";

export interface LendingPositionState {
  collateralAmount: bigint;
  debtAmount: bigint;
  collateralValue: bigint;
  debtValue: bigint;
  isCollateralized: boolean;
  healthRatio: number;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

const EMPTY: Omit<LendingPositionState, "loading" | "error" | "refresh"> = {
  collateralAmount: 0n,
  debtAmount: 0n,
  collateralValue: 0n,
  debtValue: 0n,
  isCollateralized: false,
  healthRatio: Infinity,
};

function isNoPosition(e: unknown): boolean {
  const s = String(e).toLowerCase();
  return (
    s.includes("asset-config-nonexistent") ||
    s.includes("pool-not-found") ||
    s.includes("position-not-found") ||
    s.includes("not found") ||
    s.includes("nonexistent") ||
    s.includes("contract error") ||    // catches starknet_call revert errors
    s.includes("revert_error")
  );
}

export function useLendingPosition(
  wallet: Wallet | null,
  collateralToken: Token,
  debtToken: Token,
  poolAddress: string | null
): LendingPositionState {
  const [state, setState] = useState<Omit<LendingPositionState, "refresh">>({
    ...EMPTY,
    loading: false,
    error: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPosition = useCallback(async () => {
    if (!wallet || !poolAddress) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const req = {
        collateralToken,
        debtToken,
        poolAddress: poolAddress as unknown as Address,
      };
      const [position, health] = await Promise.all([
        wallet.lending().getPosition(req),
        wallet.lending().getHealth(req),
      ]);
      const { collateralValue, debtValue } = health;
      const healthRatio =
        debtValue === 0n ? Infinity : Number(collateralValue) / Number(debtValue);

      setState({
        collateralAmount: position.collateralAmount ?? 0n,
        debtAmount: position.debtAmount ?? 0n,
        collateralValue,
        debtValue,
        isCollateralized: health.isCollateralized,
        healthRatio,
        loading: false,
        error: null,
      });
    } catch (e) {
      if (isNoPosition(e)) {
        setState({ ...EMPTY, loading: false, error: null });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
      }
    }
  }, [wallet, collateralToken, debtToken, poolAddress]);

  useEffect(() => {
    if (!wallet || !poolAddress) return;
    fetchPosition();
    intervalRef.current = setInterval(fetchPosition, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [wallet, poolAddress, fetchPosition]);

  return { ...state, refresh: fetchPosition };
}
