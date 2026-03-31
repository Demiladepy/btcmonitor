import { useState, useCallback, useRef } from "react";
import type { AlertEvent, AlertType, NotificationPrefs } from "../lib/notificationTypes";
import { DEFAULT_PREFS } from "../lib/notificationTypes";

const PREFS_KEY = "btch_notification_prefs";
const RATE_KEY = "btch_alert_rate";
const RATE_LIMIT_MS = 5 * 60 * 1000;

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_PREFS };
}

function savePrefs(prefs: NotificationPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function getRateMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function setRateMap(map: Record<string, number>) {
  localStorage.setItem(RATE_KEY, JSON.stringify(map));
}

function isRateLimited(type: AlertType): boolean {
  const map = getRateMap();
  const last = map[type] ?? 0;
  return Date.now() - last < RATE_LIMIT_MS;
}

function markSent(type: AlertType) {
  const map = getRateMap();
  map[type] = Date.now();
  setRateMap(map);
}

const API_SECRET = import.meta.env.VITE_ALERT_API_SECRET ?? "";

async function postAlert(path: string, body: object): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-alert-secret": API_SECRET,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useNotifications() {
  const [prefs, setPrefsState] = useState<NotificationPrefs>(loadPrefs);
  const sendingRef = useRef(false);

  const updatePrefs = useCallback((partial: Partial<NotificationPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...partial };
      savePrefs(next);
      return next;
    });
  }, []);

  const isConfigured = Boolean(
    (prefs.channel === "telegram" || prefs.channel === "both") && prefs.telegramChatId ||
    (prefs.channel === "email" || prefs.channel === "both") && prefs.emailAddress
  );

  const sendAlert = useCallback(
    async (event: AlertEvent): Promise<void> => {
      if (sendingRef.current) return;
      if (!prefs.alertTypes.includes(event.type)) return;
      if (!isConfigured) return;
      if (isRateLimited(event.type)) return;

      sendingRef.current = true;
      markSent(event.type);

      const sends: Promise<boolean>[] = [];

      if (
        (prefs.channel === "telegram" || prefs.channel === "both") &&
        prefs.telegramChatId
      ) {
        sends.push(
          postAlert("/api/send-telegram", { chatId: prefs.telegramChatId, event })
        );
      }

      if (
        (prefs.channel === "email" || prefs.channel === "both") &&
        prefs.emailAddress
      ) {
        sends.push(
          postAlert("/api/send-email", { email: prefs.emailAddress, event })
        );
      }

      await Promise.allSettled(sends);
      sendingRef.current = false;
    },
    [prefs, isConfigured]
  );

  return { prefs, updatePrefs, isConfigured, sendAlert };
}
