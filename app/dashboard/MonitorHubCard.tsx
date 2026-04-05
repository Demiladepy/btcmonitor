"use client";

import { useCallback, useEffect, useState } from "react";

type Props = {
  walletId: string | null;
  telegramHint?: "alertsPage" | "dashboard";
};

export function MonitorHubCard({ walletId, telegramHint = "dashboard" }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifyContactEmail, setNotifyContactEmail] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [notifyPositions, setNotifyPositions] = useState(true);
  const [notifyYield, setNotifyYield] = useState(false);
  const [notifyLiquidation, setNotifyLiquidation] = useState(true);
  const [notifyMarket, setNotifyMarket] = useState(false);
  const [lastDigest, setLastDigest] = useState<string | null>(null);
  const [privyEmail, setPrivyEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!walletId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/preferences", {
        headers: { "x-wallet-id": walletId },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load preferences");
      const p = data?.alertPreferences;
      const u = data?.user;
      if (!p) throw new Error("Invalid preferences payload");
      setNotifyContactEmail(p.notifyContactEmail ?? "");
      setEmailEnabled(Boolean(p.emailEnabled));
      setTelegramEnabled(Boolean(p.telegramEnabled));
      setNotifyPositions(Boolean(p.notifyPositions));
      setNotifyYield(Boolean(p.notifyYield));
      setNotifyLiquidation(Boolean(p.notifyLiquidation));
      setNotifyMarket(Boolean(p.notifyMarket));
      setLastDigest(p.lastMarketDigestAt ?? null);
      setPrivyEmail(u?.email ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [walletId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!walletId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-id": walletId,
        },
        body: JSON.stringify({
          notifyContactEmail: notifyContactEmail.trim() === "" ? null : notifyContactEmail.trim(),
          emailEnabled,
          telegramEnabled,
          notifyPositions,
          notifyYield,
          notifyLiquidation,
          notifyMarket,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [
    walletId,
    notifyContactEmail,
    emailEnabled,
    telegramEnabled,
    notifyPositions,
    notifyYield,
    notifyLiquidation,
    notifyMarket,
    load,
  ]);

  if (!walletId) return null;

  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-2xl p-6 space-y-4 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Monitor notifications</h2>
        <p className="text-sm text-gray-600 mt-1">
          Personalized updates for your positions, risk of liquidation, and optional market summaries. Email uses the
          address below if set; otherwise we fall back to your wallet provider email
          {privyEmail ? ` (${privyEmail})` : ""}.
        </p>
        {telegramHint === "dashboard" && (
          <p className="text-sm text-amber-900/80 mt-2">
            Link Telegram from the <span className="font-medium">Alerts</span> page to receive the same messages there.
          </p>
        )}
        {telegramHint === "alertsPage" && (
          <p className="text-sm text-amber-900/80 mt-2">Enable the Telegram channel here, then connect the bot below.</p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="notify-email">
              Email for alerts
            </label>
            <input
              id="notify-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={notifyContactEmail}
              onChange={(e) => setNotifyContactEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
              <span>Email channel</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={telegramEnabled} onChange={(e) => setTelegramEnabled(e.target.checked)} />
              <span>Telegram channel</span>
            </label>
          </div>

          <div className="border-t border-amber-200/80 pt-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Topics</p>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={notifyPositions} onChange={(e) => setNotifyPositions(e.target.checked)} />
              <span>Position health (early warnings)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={notifyYield} onChange={(e) => setNotifyYield(e.target.checked)} />
              <span>Yield reminders (in market digests)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={notifyLiquidation}
                onChange={(e) => setNotifyLiquidation(e.target.checked)}
              />
              <span>Liquidation risk (danger & critical)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={notifyMarket} onChange={(e) => setNotifyMarket(e.target.checked)} />
              <span>Market movement (~every 6h snapshot: BTC / STRK)</span>
            </label>
          </div>

          {lastDigest && (
            <p className="text-xs text-gray-500">Last market snapshot sent: {new Date(lastDigest).toLocaleString()}</p>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
          {saved && <p className="text-sm text-green-700 bg-green-50 border border-green-200 p-2 rounded-lg">Settings saved.</p>}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save notification settings"}
          </button>
        </div>
      )}
    </div>
  );
}
