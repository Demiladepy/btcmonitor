import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "btc_health_history";
const MAX_ENTRIES = 48;

export interface HealthEntry {
  timestamp: number;
  healthRatio: number;
}

export function useHealthHistory(healthRatio: number) {
  const [history, setHistory] = useState<HealthEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const lastRatioRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isFinite(healthRatio) || healthRatio === lastRatioRef.current) return;
    lastRatioRef.current = healthRatio;

    setHistory((prev) => {
      const entry: HealthEntry = { timestamp: Date.now(), healthRatio };
      const next = [...prev, entry].slice(-MAX_ENTRIES);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [healthRatio]);

  return { history };
}
