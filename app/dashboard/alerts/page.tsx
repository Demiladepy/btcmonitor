"use client";

import { MonitorHubCard } from "@/app/dashboard/MonitorHubCard";
import { BTC_MONITOR_WALLET_ID_KEY } from "@/lib/btc-health-network";
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
  liquidationPrice: number | null;
  currentPrice: number | null;
  distancePct: number | null;
  emailSent: boolean;
  telegramSent: boolean;
};

type MonitoredPair = { collateralSymbol: string; debtSymbol: string };

const ALL_PAIRS: MonitoredPair[] = [
  { collateralSymbol: "WBTC", debtSymbol: "USDC" },
  { collateralSymbol: "WBTC", debtSymbol: "USDT" },
  { collateralSymbol: "LBTC", debtSymbol: "USDC" },
  { collateralSymbol: "TBTC", debtSymbol: "USDC" },
  { collateralSymbol: "ETH", debtSymbol: "USDC" },
  { collateralSymbol: "ETH", debtSymbol: "USDT" },
];

function relativeTime(fromIso: string) {
  const diffMs = Date.now() - new Date(fromIso).getTime();
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AlertsPage() {
  const router = useRouter();
  const { wallet } = useWallet();

  const [prefsLoading, setPrefsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [connectTelegramLoading, setConnectTelegramLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Thresholds
  const [warningThreshold, setWarningThreshold] = useState(1.5);
  const [dangerThreshold, setDangerThreshold] = useState(1.2);
  const [criticalThreshold, setCriticalThreshold] = useState(1.05);
  const [liquidationDistancePct, setLiquidationDistancePct] = useState(15.0);
  const [cooldownMinutes, setCooldownMinutes] = useState(15);

  // Channels
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [telegramLinkCode, setTelegramLinkCode] = useState<string | null>(null);

  // Auto-protect
  const [autoProtectEnabled, setAutoProtectEnabled] = useState(false);

  // Monitored pairs
  const [monitoredPairs, setMonitoredPairs] = useState<Set<string>>(
    new Set(ALL_PAIRS.map((p) => `${p.collateralSymbol}/${p.debtSymbol}`)),
  );

  // Alert history
  const [alerts, setAlerts] = useState<AlertHistoryItem[]>([]);

  const [walletId, setWalletId] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [botRegistering, setBotRegistering] = useState(false);
  const [botRegResult, setBotRegResult] = useState<string | null>(null);

  useEffect(() => {
    setWalletId(localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY));
  }, []);

  const telegramLink = useMemo(() => {
    if (!telegramLinkCode) return null;
    return `https://t.me/BTCHealthMonitorBot?start=${telegramLinkCode}`;
  }, [telegramLinkCode]);

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
      const pairs = data?.monitoredPairs as MonitoredPair[] | undefined;

      if (!p) throw new Error("Invalid preferences payload");

      setWarningThreshold(Number(p.warningThreshold));
      setDangerThreshold(Number(p.dangerThreshold));
      setCriticalThreshold(Number(p.criticalThreshold));
      setLiquidationDistancePct(Number(p.liquidationDistancePct ?? 15));
      setEmailEnabled(Boolean(p.emailEnabled));
      setTelegramEnabled(Boolean(p.telegramEnabled));
      setCooldownMinutes(Number(p.cooldownMinutes));
      setAutoProtectEnabled(Boolean(p.autoProtectEnabled));
      setTelegramChatId(u?.telegramChatId ?? null);

      if (pairs) {
        setMonitoredPairs(new Set(pairs.map((p) => `${p.collateralSymbol}/${p.debtSymbol}`)));
      }
    } catch (err: unknown) {
      setPrefsError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setPrefsLoading(false);
    }
  }, [walletId]);

  const loadHistory = useCallback(async () => {
    if (!walletId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/alerts/history", {
        headers: { "x-wallet-id": walletId },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load history");
      setAlerts(data?.alerts ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load history");
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

  // Poll for Telegram connection confirmation
  useEffect(() => {
    if (!wallet || !walletId || !telegramLinkCode || telegramEnabled) return;
    const interval = window.setInterval(() => loadPrefs().catch(() => undefined), 4000);
    return () => window.clearInterval(interval);
  }, [wallet, walletId, telegramLinkCode, telegramEnabled, loadPrefs]);

  const handleSave = useCallback(async () => {
    if (!walletId) return;
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const pairs = ALL_PAIRS.filter((p) => monitoredPairs.has(`${p.collateralSymbol}/${p.debtSymbol}`));
      const res = await fetch("/api/alerts/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet-id": walletId },
        body: JSON.stringify({
          warningThreshold,
          dangerThreshold,
          criticalThreshold,
          liquidationDistancePct,
          cooldownMinutes,
          emailEnabled,
          autoProtectEnabled,
          monitoredPairs: pairs,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadPrefs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [
    walletId, warningThreshold, dangerThreshold, criticalThreshold,
    liquidationDistancePct, cooldownMinutes, emailEnabled,
    autoProtectEnabled, monitoredPairs, loadPrefs,
  ]);

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
      if (!res.ok) throw new Error(data?.error || "Failed to generate link");
      setTelegramLinkCode(String(data.code));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect Telegram");
    } finally {
      setConnectTelegramLoading(false);
    }
  }, [walletId]);

  const handleTestMonitor = useCallback(async () => {
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/cron/monitor?dry_run=1");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestResult(`Error: ${data?.error ?? res.statusText}`);
      } else {
        setTestResult(
          `Dry run — usersChecked: ${data.usersChecked ?? 0}, alertsWouldSend: ${data.alertsSent ?? 0}, errors: ${data.errors?.length ?? 0} (no emails/Telegram sent)`,
        );
      }
    } catch (err: unknown) {
      setTestResult(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestRunning(false);
    }
  }, []);

  const handleRegisterBot = useCallback(async () => {
    setBotRegistering(true);
    setBotRegResult(null);
    try {
      const res = await fetch("/api/notifications/telegram/setup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed");
      setBotRegResult(`Registered: ${data.webhookUrl}`);
    } catch (err: unknown) {
      setBotRegResult(err instanceof Error ? err.message : "Failed");
    } finally {
      setBotRegistering(false);
    }
  }, []);

  const togglePair = (key: string) => {
    setMonitoredPairs((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

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
          <h2 className="text-3xl font-bold text-gray-900 mb-1">Alerts</h2>
          <p className="text-gray-500">Configure thresholds, channels, and view your alert history.</p>
        </section>

        {/* Status bar */}
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse inline-block" />
            <span className="text-sm font-medium text-green-800">
              Monitoring active — checking every 60 seconds
            </span>
          </div>
          <div className="flex items-center gap-3">
            {testResult && <span className="text-xs text-green-700 max-w-xs truncate">{testResult}</span>}
            <button
              type="button"
              onClick={handleTestMonitor}
              disabled={testRunning}
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-white border border-green-300 text-green-800 hover:bg-green-100 disabled:opacity-50"
            >
              {testRunning ? "Running…" : "▶ Dry Run"}
            </button>
          </div>
        </div>

        {prefsError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
            {prefsError}
          </div>
        )}

        <MonitorHubCard walletId={walletId} telegramHint="alertsPage" />

        {/* ── Section 1: Thresholds ─────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Alert Thresholds</h3>
            <span className="text-xs text-gray-400">Health = collateral / debt</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Warning", desc: "Heads up — health is declining", value: warningThreshold, set: setWarningThreshold, color: "amber" },
              { label: "Danger", desc: "Urgent — take action soon", value: dangerThreshold, set: setDangerThreshold, color: "orange" },
              { label: "Critical", desc: "Emergency — liquidation imminent", value: criticalThreshold, set: setCriticalThreshold, color: "red" },
            ].map(({ label, desc, value, set }) => (
              <div key={label} className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-3">
                <div>
                  <p className="font-semibold text-gray-900">{label} Threshold</p>
                  <p className="text-sm text-gray-500">{desc}</p>
                </div>
                <input
                  type="number"
                  step="0.05"
                  min="1.0"
                  max="3.0"
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  className="w-full h-12 rounded-xl border border-gray-300 px-4 text-lg bg-white"
                />
              </div>
            ))}
          </div>

          {/* Liquidation distance threshold */}
          <div className="border border-amber-100 bg-amber-50 rounded-2xl p-6 space-y-3">
            <div>
              <p className="font-semibold text-amber-900">Liquidation Distance Alert</p>
              <p className="text-sm text-amber-700">
                Send a critical alert when the position is within this % of the liquidation price.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="number"
                step="1"
                min="1"
                max="50"
                value={liquidationDistancePct}
                onChange={(e) => setLiquidationDistancePct(Number(e.target.value))}
                className="w-32 h-12 rounded-xl border border-amber-300 px-4 text-lg bg-white"
              />
              <span className="text-amber-800 font-medium">% from liquidation price</span>
            </div>
            <p className="text-xs text-amber-700">
              Default 15% — alert fires when collateral price is within {liquidationDistancePct}% of the liquidation price.
            </p>
          </div>

          {/* Cooldown */}
          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-3">
            <div>
              <p className="font-semibold text-gray-900">Alert Cooldown</p>
              <p className="text-sm text-gray-500">Don&apos;t send more than one alert per position per:</p>
            </div>
            <select
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(Number(e.target.value))}
              className="w-full h-12 rounded-xl border border-gray-300 px-4 text-lg bg-white"
            >
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>
        </section>

        {/* ── Section 2: Notification Channels ─────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-xl font-bold">Notification Channels</h3>

          {/* Email toggle */}
          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">Email</p>
                <p className="text-sm text-gray-500">
                  Receive alerts at the email linked to your wallet.
                </p>
              </div>
              <label className="relative inline-flex h-7 w-14 items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="sr-only"
                />
                <span className={`absolute inset-0 rounded-full transition-colors ${emailEnabled ? "bg-amber-500" : "bg-gray-200"}`} />
                <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${emailEnabled ? "translate-x-7" : "translate-x-0"}`} />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-flex h-6 px-3 items-center rounded-full text-xs font-semibold ${
                emailEnabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
              }`}>
                {emailEnabled ? "ON" : "OFF"}
              </span>
            </div>
          </div>

          {/* Telegram */}
          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">Telegram</p>
                <p className="text-sm text-gray-500">
                  Real-time alerts and bot commands (/status, /repay, /mute).
                </p>
              </div>
              <span className={`inline-flex h-7 px-3 items-center rounded-full text-xs font-semibold ${
                telegramEnabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
              }`}>
                {telegramEnabled ? "Linked" : "Not linked"}
              </span>
            </div>

            {telegramEnabled ? (
              <div className="space-y-3">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 text-sm font-semibold">
                  ✅ Connected
                </span>
                {telegramChatId && (
                  <p className="text-sm text-gray-500">Chat ID: <span className="font-mono">{telegramChatId}</span></p>
                )}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-1.5">
                  <p className="font-semibold text-gray-700 mb-2">Bot commands</p>
                  {[
                    ["/status", "Current health ratios + liquidation prices"],
                    ["/repay", "Emergency 10% repay (auto-protect must be on)"],
                    ["/mute", "Silence alerts for 60 minutes"],
                  ].map(([cmd, desc]) => (
                    <div key={cmd} className="flex gap-2">
                      <span className="font-mono text-amber-700 w-20 shrink-0">{cmd}</span>
                      <span className="text-gray-600">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleConnectTelegram}
                  disabled={connectTelegramLoading}
                  className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl disabled:opacity-50"
                >
                  {connectTelegramLoading ? "Generating…" : "Connect Telegram"}
                </button>
                {telegramLink && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 text-sm">
                    <p className="font-semibold text-amber-900">Your Telegram link</p>
                    <p className="font-mono break-all text-amber-800 text-xs">{telegramLink}</p>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(telegramLink).catch(() => undefined)}
                      className="w-full h-10 bg-white border border-amber-300 text-amber-800 font-semibold rounded-xl hover:bg-amber-100"
                    >
                      Copy link
                    </button>
                    <p className="text-xs text-amber-700">Open in Telegram and send /start to link your account.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Register bot webhook */}
          <div className="border border-gray-200 rounded-2xl p-5 bg-white shadow-sm space-y-3">
            <div>
              <p className="font-semibold text-gray-900 text-sm">Register Telegram bot webhook</p>
              <p className="text-xs text-gray-500">Run once after deploying to Vercel.</p>
            </div>
            {botRegResult && (
              <p className={`text-sm rounded-lg p-2 ${botRegResult.startsWith("Registered") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {botRegResult}
              </p>
            )}
            <button
              type="button"
              onClick={handleRegisterBot}
              disabled={botRegistering}
              className="h-9 px-4 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
            >
              {botRegistering ? "Registering…" : "Register webhook"}
            </button>
          </div>
        </section>

        {/* ── Section 3: Monitored Pairs ───────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h3 className="text-xl font-bold">Monitored Pairs</h3>
            <p className="text-sm text-gray-500 mt-1">Choose which positions to watch on Vesu mainnet.</p>
          </div>

          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {ALL_PAIRS.map((pair) => {
                const key = `${pair.collateralSymbol}/${pair.debtSymbol}`;
                const checked = monitoredPairs.has(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      checked
                        ? "border-amber-300 bg-amber-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePair(key)}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span className={`text-sm font-semibold ${checked ? "text-amber-900" : "text-gray-700"}`}>
                      {key}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-4">
              The monitor checks each selected pair every minute. Pairs with no open position are silently skipped.
            </p>
          </div>
        </section>

        {/* Auto-protect */}
        <section>
          <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">Auto-protect (MVP)</p>
                <p className="text-sm text-gray-500">
                  If health becomes critical, the monitor repays 10% of your debt automatically (WBTC/USDC only).
                </p>
              </div>
              <label className="relative inline-flex h-7 w-14 items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoProtectEnabled}
                  onChange={(e) => setAutoProtectEnabled(e.target.checked)}
                  className="sr-only"
                />
                <span className={`absolute inset-0 rounded-full transition-colors ${autoProtectEnabled ? "bg-amber-500" : "bg-gray-200"}`} />
                <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${autoProtectEnabled ? "translate-x-7" : "translate-x-0"}`} />
              </label>
            </div>
          </div>
        </section>

        {/* Save button */}
        <div className="space-y-3 pt-2">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
          )}
          {saveSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 font-semibold">
              Saved ✓
            </div>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || prefsLoading}
            className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
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

        {/* ── Section 4: Alert History ─────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Alert History</h3>
            <button
              type="button"
              onClick={() => loadHistory().catch(() => undefined)}
              disabled={historyLoading}
              className="text-sm text-amber-600 hover:text-amber-800 disabled:opacity-50"
            >
              ↻ Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-4 animate-pulse h-14" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="border border-gray-200 rounded-2xl p-8 text-center bg-white shadow-sm">
              <p className="text-gray-600 font-medium">No alerts yet.</p>
              <p className="text-sm text-gray-400 mt-1">We&apos;ll notify you when your positions need attention.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="min-w-full text-sm bg-white">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200 bg-gray-50">
                    <th className="py-3 px-4 font-semibold">Time</th>
                    <th className="py-3 px-4 font-semibold">Position</th>
                    <th className="py-3 px-4 font-semibold">Level</th>
                    <th className="py-3 px-4 font-semibold">Health</th>
                    <th className="py-3 px-4 font-semibold">Liq. Price</th>
                    <th className="py-3 px-4 font-semibold">Distance</th>
                    <th className="py-3 px-4 font-semibold">Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const levelStyles =
                      a.level === "warning"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : a.level === "danger"
                          ? "bg-orange-50 text-orange-800 border-orange-200"
                          : "bg-red-100 text-red-900 border-red-300";
                    return (
                      <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{relativeTime(a.createdAt)}</td>
                        <td className="py-3 px-4 font-semibold">{a.position}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-bold ${levelStyles}`}>
                            {a.level.charAt(0).toUpperCase() + a.level.slice(1)}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {Number.isFinite(a.healthRatio) ? a.healthRatio.toFixed(3) : "∞"}
                        </td>
                        <td className="py-3 px-4 text-red-700 font-semibold">
                          {a.liquidationPrice != null
                            ? `$${a.liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                            : "—"}
                        </td>
                        <td className="py-3 px-4">
                          {a.distancePct != null ? (
                            <span className={`font-semibold ${a.distancePct < 10 ? "text-red-700" : a.distancePct < 25 ? "text-amber-600" : "text-green-700"}`}>
                              {a.distancePct.toFixed(1)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1.5 flex-wrap">
                            {a.emailSent && (
                              <span className="px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-800 text-xs font-semibold">
                                Email
                              </span>
                            )}
                            {a.telegramSent && (
                              <span className="px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-semibold">
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
