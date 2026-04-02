"use client";

import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet-context";
import { useCallback, useEffect, useMemo, useState } from "react";

type AlertLevel = "warning" | "danger" | "critical";

type AlertHistoryItem = {
  id: string;
  createdAt: string;
  position: string;
  level: AlertLevel;
  healthRatio: number;
  emailSent: boolean;
  telegramSent: boolean;
};

function relativeTime(fromIso: string) {
  const from = new Date(fromIso).getTime();
  const diffMs = Date.now() - from;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec} sec ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 48) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

/** Placeholder: Step 4 adds thresholds, Telegram, and Prisma-backed history. */
export default function AlertsPlaceholderPage() {
  const router = useRouter();
  const { wallet } = useWallet();

  const [prefsLoading, setPrefsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [connectTelegramLoading, setConnectTelegramLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const [warningThreshold, setWarningThreshold] = useState(1.5);
  const [dangerThreshold, setDangerThreshold] = useState(1.2);
  const [criticalThreshold, setCriticalThreshold] = useState(1.05);

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState<string | null>(null);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);

  const [cooldownMinutes, setCooldownMinutes] = useState(15);

  const [telegramLinkCode, setTelegramLinkCode] = useState<string | null>(null);
  const telegramLink = useMemo(() => {
    if (!telegramLinkCode) return null;
    return `https://t.me/BTCHealthMonitorBot?start=${telegramLinkCode}`;
  }, [telegramLinkCode]);

  const [alerts, setAlerts] = useState<AlertHistoryItem[]>([]);

  const [walletId, setWalletId] = useState<string | null>(null);

  useEffect(() => {
    setWalletId(localStorage.getItem("btcmonitor_wallet_id"));
  }, []);

  const loadPrefs = useCallback(async () => {
    if (!walletId) return;
    setPrefsLoading(true);
    setPrefsError(null);
    try {
      const res = await fetch("/api/alerts/preferences", {
        headers: { "x-wallet-id": walletId },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load preferences");

      const p = data?.alertPreferences;
      const u = data?.user;
      if (!p) throw new Error("Invalid preferences payload");

      setWarningThreshold(p.warningThreshold);
      setDangerThreshold(p.dangerThreshold);
      setCriticalThreshold(p.criticalThreshold);
      setEmailEnabled(p.emailEnabled);
      setTelegramEnabled(p.telegramEnabled);
      setCooldownMinutes(p.cooldownMinutes);
      setEmailAddress(u?.email ?? null);
      setTelegramChatId(u?.telegramChatId ?? null);
    } catch (err: unknown) {
      setPrefsError(err instanceof Error ? err.message : "Failed to load preferences");
    } finally {
      setPrefsLoading(false);
    }
  }, [walletId]);

  const loadHistory = useCallback(async () => {
    if (!walletId) return;
    setHistoryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/history", {
        headers: { "x-wallet-id": walletId },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load alert history");
      setAlerts(data?.alerts ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load alert history");
    } finally {
      setHistoryLoading(false);
    }
  }, [walletId]);

  useEffect(() => {
    if (!wallet) router.push("/");
  }, [wallet, router]);

  useEffect(() => {
    if (!wallet || !walletId) return;
    loadPrefs();
    loadHistory();
  }, [wallet, walletId, loadPrefs, loadHistory]);

  // Poll for Telegram connection after generating a link.
  useEffect(() => {
    if (!wallet || !walletId) return;
    if (!telegramLinkCode) return;
    if (telegramEnabled) return;
    const interval = window.setInterval(() => {
      loadPrefs().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [wallet, walletId, telegramLinkCode, telegramEnabled, loadPrefs]);

  const handleSave = useCallback(async () => {
    if (!walletId) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-id": walletId,
        },
        body: JSON.stringify({
          warningThreshold,
          dangerThreshold,
          criticalThreshold,
          emailEnabled,
          telegramEnabled,
          cooldownMinutes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save preferences");
      await loadPrefs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  }, [walletId, warningThreshold, dangerThreshold, criticalThreshold, emailEnabled, telegramEnabled, cooldownMinutes, loadPrefs]);

  const handleConnectTelegram = useCallback(async () => {
    if (!walletId) return;
    setConnectTelegramLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/telegram-link", {
        method: "POST",
        headers: { "x-wallet-id": walletId },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to generate Telegram link");
      if (!data?.code) throw new Error("Missing code from Telegram link endpoint");
      setTelegramLinkCode(String(data.code));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect Telegram");
    } finally {
      setConnectTelegramLoading(false);
    }
  }, [walletId]);

  const copyTelegramLink = useCallback(async () => {
    if (!telegramLink) return;
    try {
      await navigator.clipboard.writeText(telegramLink);
    } catch {
      setError("Copy failed. Please copy the link manually.");
    }
  }, [telegramLink]);

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-200 px-6 py-4 max-w-6xl mx-auto flex items-center justify-between">
        <h1 className="text-xl font-bold">
          BTC Health <span className="text-amber-500">Monitor</span>
        </h1>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Dashboard
        </button>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Alerts</h2>
          <p className="text-gray-500">Tune thresholds, choose channels, and view your alert history.</p>
        </section>

        {prefsError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            {prefsError}
          </div>
        )}

        <section className="grid grid-cols-1 gap-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Alert Thresholds</h3>
            <span className="text-xs text-gray-400">Health ratio <span className="font-mono">collateral/debt</span></span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-3">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">Warning Threshold</p>
                <p className="text-sm text-gray-600">Sends a heads up when health falls below this ratio.</p>
              </div>
              <input
                type="number"
                step="0.05"
                min="1.0"
                max="3.0"
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(Number(e.target.value))}
                className="w-full h-12 rounded-xl border border-gray-300 px-4 text-lg bg-white"
              />
            </div>

            <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-3">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">Danger Threshold</p>
                <p className="text-sm text-gray-600">Triggers urgent alerts when health gets dangerously low.</p>
              </div>
              <input
                type="number"
                step="0.05"
                min="1.0"
                max="3.0"
                value={dangerThreshold}
                onChange={(e) => setDangerThreshold(Number(e.target.value))}
                className="w-full h-12 rounded-xl border border-gray-300 px-4 text-lg bg-white"
              />
            </div>

            <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-3">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">Critical Threshold</p>
                <p className="text-sm text-gray-600">Emergency alert: act now before liquidation.</p>
              </div>
              <input
                type="number"
                step="0.05"
                min="1.0"
                max="3.0"
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                className="w-full h-12 rounded-xl border border-gray-300 px-4 text-lg bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">Email</p>
                  <p className="text-sm text-gray-600">Email alerts are sent when your positions cross thresholds</p>
                </div>

                <label className="relative inline-flex h-7 w-14 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`absolute inset-0 rounded-full transition-colors ${emailEnabled ? "bg-amber-500" : "bg-gray-200"}`}
                  />
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                      emailEnabled ? "translate-x-7" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>

              <div className="mt-1">
                <p className="text-xs text-gray-500">Connected email address</p>
                <p className="font-mono text-sm">{emailAddress ?? "—"}</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900">Telegram</p>
                  <p className="text-sm text-gray-600">Instant DM alerts directly in Telegram</p>
                </div>

                <label className="relative inline-flex h-7 w-14 items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={telegramEnabled}
                    readOnly
                    className="sr-only"
                  />
                  <span
                    className={`absolute inset-0 rounded-full transition-colors ${
                      telegramEnabled ? "bg-amber-500" : "bg-gray-200"
                    }`}
                  />
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                      telegramEnabled ? "translate-x-7" : "translate-x-0"
                    }`}
                  />
                </label>
              </div>

              {telegramEnabled ? (
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 text-sm font-semibold">
                    Connected ✓
                  </span>
                  {telegramChatId && (
                    <div>
                      <p className="text-xs text-gray-500">Chat ID</p>
                      <p className="font-mono text-sm">{telegramChatId}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleConnectTelegram}
                    disabled={connectTelegramLoading}
                    className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait"
                  >
                    {connectTelegramLoading ? "Generating link…" : "Connect Telegram"}
                  </button>

                  {telegramLink && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm space-y-3">
                      <p className="font-semibold text-amber-900">Telegram link</p>
                      <p className="font-mono break-all text-amber-900">{telegramLink}</p>
                      <button
                        type="button"
                        onClick={copyTelegramLink}
                        className="w-full h-10 bg-white border border-amber-300 text-amber-800 font-semibold rounded-xl hover:bg-amber-100 transition-colors"
                      >
                        Copy link
                      </button>
                      <p className="text-xs text-amber-900/70">
                        Open it in Telegram and send <span className="font-mono">/start</span>.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-4">
            <div>
              <p className="font-semibold text-gray-900">Don&apos;t send more than one alert per position every:</p>
              <p className="text-sm text-gray-600">Choose a cooldown period.</p>
            </div>
            <div className="space-y-2">
              <select
                value={cooldownMinutes}
                onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                className="w-full h-12 rounded-xl border border-gray-300 px-4 text-lg bg-white"
              >
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
              <p className="text-xs text-gray-500">This reduces alert spam while you stay near thresholds.</p>
            </div>
          </div>

          <div className="pt-2 space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || prefsLoading}
              className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-3"
            >
              {isSaving ? (
                <>
                  <span className="inline-block animate-spin rounded-full border-2 border-white border-t-transparent w-5 h-5" />
                  Saving…
                </>
              ) : (
                "Save Preferences"
              )}
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Alert History</h3>
            <button
              type="button"
              onClick={() => {
                loadHistory().catch(() => undefined);
              }}
              disabled={historyLoading}
              className="text-sm font-medium text-amber-600 hover:text-amber-800 disabled:opacity-50"
            >
              ↻ Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-4 animate-pulse h-16" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="border border-gray-200 rounded-2xl p-8 text-center bg-white shadow-sm">
              <p className="text-gray-700 font-semibold">No alerts yet. We&apos;ll notify you when your positions need attention.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-3 px-4 font-semibold">Time</th>
                    <th className="py-3 px-4 font-semibold">Position</th>
                    <th className="py-3 px-4 font-semibold">Level</th>
                    <th className="py-3 px-4 font-semibold">Health Ratio</th>
                    <th className="py-3 px-4 font-semibold">Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const levelLabel = a.level === "warning" ? "Warning" : a.level === "danger" ? "Danger" : "Critical";
                    const levelStyles =
                      a.level === "warning"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : a.level === "danger"
                          ? "bg-red-50 text-red-800 border-red-200"
                          : "bg-red-900 text-white border-red-900";
                    return (
                      <tr key={a.id} className="border-b border-gray-100">
                        <td className="py-4 px-4 text-gray-700">{relativeTime(a.createdAt)}</td>
                        <td className="py-4 px-4 font-semibold">{a.position}</td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full border ${levelStyles} text-xs font-bold`}>
                            {levelLabel}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono text-gray-800">{Number.isFinite(a.healthRatio) ? a.healthRatio.toFixed(3) : "∞"}</td>
                        <td className="py-4 px-4">
                          <div className="flex gap-2 flex-wrap">
                            {a.emailSent && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full border border-sky-200 bg-sky-50 text-sky-800 text-xs font-semibold">
                                Email
                              </span>
                            )}
                            {a.telegramSent && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-semibold">
                                Telegram
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
