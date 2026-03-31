import { useEffect, useRef } from "react";
import type { AlertEvent } from "../lib/notificationTypes";

const YIELD_ALERT_KEY = "btch_yield_alert_last";
const YIELD_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useYieldAlert(
  debtAmount: bigint,
  sendAlert: (event: AlertEvent) => void
) {
  const prevDebtRef = useRef<bigint | null>(null);

  useEffect(() => {
    if (debtAmount === 0n) {
      prevDebtRef.current = null;
      return;
    }

    const lastFired = Number(localStorage.getItem(YIELD_ALERT_KEY) ?? "0");
    if (Date.now() - lastFired < YIELD_INTERVAL_MS) return;

    // Only fire if we already had a previous debt (not first load)
    if (prevDebtRef.current !== null && prevDebtRef.current > 0n) {
      localStorage.setItem(YIELD_ALERT_KEY, String(Date.now()));
      sendAlert({
        type: "yield_earned",
        message: "Your collateral is earning yield on Vesu. Check your position for accrued returns.",
      });
    }

    prevDebtRef.current = debtAmount;
  }, [debtAmount, sendAlert]);
}
