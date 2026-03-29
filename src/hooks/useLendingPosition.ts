import { useState, useEffect, useCallback, useRef } from "react";
import type { Wallet, Token } from "starkzap";

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

const EMPTY_POSITION: Omit<LendingPositionState, "loading" | "error" | "refresh"> = {
  collateralAmount: 0n,
  debtAmount: 0n,
  collateralValue: 0n,
  debtValue: 0n,
  isCollateralized: false,
  healthRatio: Infinity,
};

function isNoPositionError(e: unknown): boolean {
  const msg = String(e);
  return (
    msg.includes("asset-config-nonexistent") ||
    msg.includes("pool-not-found") ||
    msg.includes("position-not-found") ||
    msg.includes("not found")
  );
}

export function useLendingPosition(
  wallet: Wallet | null,
  collateralToken: Token,
  debtToken: Token
): LendingPositionState {
  const [state, setState] = useState<Omit<LendingPositionState, "refresh">>({
    ...EMPTY_POSITION,
    loading: false,
    error: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPosition = useCallback(async () => {
    if (!wallet) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [position, health] = await Promise.all([
        wallet.lending().getPosition({ collateralToken, debtToken }),
        wallet.lending().getHealth({ collateralToken, debtToken }),
      ]);

      const collateralValue = health.collateralValue;
      const debtValue = health.debtValue;
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
      if (isNoPositionError(e)) {
        // No position exists yet — show zeros, not an error
        setState({ ...EMPTY_POSITION, loading: false, error: null });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        }));
      }
    }
  }, [wallet, collateralToken, debtToken]);

  useEffect(() => {
    if (!wallet) return;
    fetchPosition();
    intervalRef.current = setInterval(fetchPosition, 15_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [wallet, fetchPosition]);

  return { ...state, refresh: fetchPosition };
}
