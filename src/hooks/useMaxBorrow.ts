import { useState, useEffect } from "react";
import type { Wallet, Token, Address } from "starkzap";

export function useMaxBorrow(
  wallet: Wallet | null,
  collateralToken: Token,
  debtToken: Token,
  poolAddress: string | null
): { maxBorrow: bigint; loading: boolean } {
  const [maxBorrow, setMaxBorrow] = useState(0n);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet || !poolAddress) return;
    setLoading(true);
    wallet
      .lending()
      .getMaxBorrowAmount({
        collateralToken,
        debtToken,
        poolAddress: poolAddress as unknown as Address,
      })
      .then((v) => setMaxBorrow(v))
      .catch(() => setMaxBorrow(0n))
      .finally(() => setLoading(false));
  }, [wallet, collateralToken, debtToken, poolAddress]);

  return { maxBorrow, loading };
}
