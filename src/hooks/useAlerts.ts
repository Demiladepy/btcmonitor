import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "btc_health_threshold";
const DEFAULT_THRESHOLD = 1.3;

export function useAlerts(healthRatio: number) {
  const [threshold, setThresholdState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseFloat(stored) : DEFAULT_THRESHOLD;
  });
  const [alertActive, setAlertActive] = useState(false);
  const prevRatioRef = useRef<number>(Infinity);

  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const prev = prevRatioRef.current;
    const isFiniteRatio = isFinite(healthRatio);
    if (isFiniteRatio && healthRatio < threshold && prev >= threshold) {
      setAlertActive(true);
      if (Notification.permission === "granted") {
        new Notification("⚠️ Position at risk", {
          body: `Health ratio dropped to ${healthRatio.toFixed(2)}x. Consider repaying debt.`,
        });
      }
    }
    prevRatioRef.current = healthRatio;
  }, [healthRatio, threshold]);

  const setThreshold = useCallback((value: number) => {
    setThresholdState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }, []);

  const dismissAlert = useCallback(() => setAlertActive(false), []);

  return { alertActive, threshold, setThreshold, dismissAlert };
}
