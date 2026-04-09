"use client";

import { MonitorHubCard } from "@/app/dashboard/MonitorHubCard";
import { BTC_MONITOR_WALLET_ID_KEY } from "@/lib/btc-health-network";
import { useWallet } from "@/lib/wallet-context";
import { getDashboardBalanceSymbols, getVesuPositionPairs, COINGECKO_PRICE_IDS } from "@/lib/dashboard-config";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import { getPresets } from "starkzap";

const MAX_LTV = 0.80; // Vesu typical maximum loan-to-value ratio

interface Position {
  collateral: string;
  debt: string;
  collateralDecimals: number;
  debtDecimals: number;
  collateralAmountRaw: bigint | null;
  debtAmountRaw: bigint | null;
  collateralAmountHuman: number | null;
  debtAmountHuman: number | null;
  collateralValueUSD: number | null;
  debtValueUSD: number | null;
  healthRatio: number;
  isCollateralized: boolean;
  hasDebt: boolean;
  // Calculated from position data + current price
  liquidationPrice: number | null;
  distanceToLiquidation: number | null;
  loading: boolean;
  error: string | null;
}

function usdFromScale(value: bigint): number | null {
  const n = Number(value) / 1e18;
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function fmtUsd(val: number | null): string {
  if (val === null) return "—";
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtToken(val: number | null, decimals = 6): string {
  if (val === null) return "—";
  return val.toFixed(decimals > 6 ? 6 : decimals);
}

/** USD price at which collateral drops below maxLTV and position is liquidated. */
function calcLiquidationPrice(
  debtValueUSD: number,
  collateralAmountRaw: bigint,
  collateralDecimals: number,
  maxLtv: number,
): number | null {
  if (collateralAmountRaw <= BigInt(0) || debtValueUSD <= 0 || maxLtv <= 0) return null;
  const collateralAmount = Number(collateralAmountRaw) / 10 ** collateralDecimals;
  if (collateralAmount <= 0) return null;
  return debtValueUSD / (collateralAmount * maxLtv);
}

export default function Dashboard() {
  const { wallet, address, disconnect } = useWallet();
  const router = useRouter();
  const balanceSymbols = useMemo(() => getDashboardBalanceSymbols(), []);

  const [positions, setPositions] = useState<Position[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [autoProtectEnabled, setAutoProtectEnabled] = useState<boolean | null>(null);

  // Price map: token symbol → USD price (BTC variants all use bitcoin price)
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<number | null>(null);

  const [markets, setMarkets] = useState<any[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [showMarkets, setShowMarkets] = useState(false);
  const [marketsFetched, setMarketsFetched] = useState(false);

  useEffect(() => {
    if (!wallet) router.push("/");
  }, [wallet, router]);

  useEffect(() => {
    setWalletId(localStorage.getItem(BTC_MONITOR_WALLET_ID_KEY));
  }, []);

  useEffect(() => {
    if (!walletId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/alerts/preferences", {
          headers: { "x-wallet-id": walletId },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setAutoProtectEnabled(Boolean(data?.alertPreferences?.autoProtectEnabled));
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [walletId]);

  const fetchBalances = useCallback(async () => {
    if (!wallet) return;
    setLoadingBalances(true);
    try {
      const tokens = getPresets(wallet.getChainId());
      const results: Record<string, string> = {};
      // Fetch all token balances in parallel — previously sequential (6 serial RPC calls)
      await Promise.all(
        balanceSymbols.map(async (sym) => {
          const token = tokens[sym];
          if (!token) return;
          try {
            const bal = await wallet.balanceOf(token);
            results[sym] = bal.toUnit();
          } catch {
            results[sym] = "—";
          }
        }),
      );
      setBalances(results);
    } finally {
      setLoadingBalances(false);
    }
  }, [wallet, balanceSymbols]);

  const fetchPositions = useCallback(async () => {
    if (!wallet) return;
    const tokens = getPresets(wallet.getChainId());
    const positionPairs = getVesuPositionPairs();

    const initial: Position[] = positionPairs.map((p) => ({
      collateral: p.collateral,
      debt: p.debt,
      collateralDecimals: 8,
      debtDecimals: 6,
      collateralAmountRaw: null,
      debtAmountRaw: null,
      collateralAmountHuman: null,
      debtAmountHuman: null,
      collateralValueUSD: null,
      debtValueUSD: null,
      healthRatio: Infinity,
      isCollateralized: true,
      hasDebt: false,
      liquidationPrice: null,
      distanceToLiquidation: null,
      loading: true,
      error: null,
    }));
    setPositions([...initial]);

    // Fetch all pairs in parallel — previously sequential (6 pairs × 2 calls = 12 serial RPC calls).
    // Each pair updates state independently as it resolves, preserving progressive UI updates.
    await Promise.all(
      positionPairs.map(async (pair, i) => {
        const collateralToken = tokens[pair.collateral];
        const debtToken = tokens[pair.debt];

        if (!collateralToken || !debtToken) {
          setPositions((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], loading: false };
            return next;
          });
          return;
        }

        const collateralDecimals = (collateralToken as any).decimals ?? 8;
        const debtDecimals = (debtToken as any).decimals ?? 6;

        try {
          const [position, health] = await Promise.all([
            wallet.lending().getPosition({ collateralToken, debtToken }),
            wallet.lending().getHealth({ collateralToken, debtToken }),
          ]);

          const colVal = health.collateralValue;
          const dbtVal = health.debtValue;
          const colAmtRaw = (position as any).collateralAmount as bigint | undefined;
          const dbtAmtRaw = (position as any).debtAmount as bigint | undefined;

          const colValUSD = usdFromScale(colVal);
          const dbtValUSD = usdFromScale(dbtVal);
          const ratio = dbtVal === BigInt(0) ? Infinity : Number(colVal) / Number(dbtVal);
          const hasDebt = (dbtAmtRaw ?? BigInt(0)) > BigInt(0) || dbtVal > BigInt(0);

          const colAmtHuman = colAmtRaw != null
            ? Number(colAmtRaw) / 10 ** collateralDecimals
            : null;
          const dbtAmtHuman = dbtAmtRaw != null
            ? Number(dbtAmtRaw) / 10 ** debtDecimals
            : null;

          const liqPrice =
            dbtValUSD !== null && colAmtRaw != null
              ? calcLiquidationPrice(dbtValUSD, colAmtRaw, collateralDecimals, MAX_LTV)
              : null;

          setPositions((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              collateralDecimals,
              debtDecimals,
              collateralAmountRaw: colAmtRaw ?? null,
              debtAmountRaw: dbtAmtRaw ?? null,
              collateralAmountHuman: colAmtHuman,
              debtAmountHuman: dbtAmtHuman,
              collateralValueUSD: colValUSD,
              debtValueUSD: dbtValUSD,
              healthRatio: ratio,
              isCollateralized: health.isCollateralized,
              hasDebt,
              liquidationPrice: liqPrice,
              loading: false,
            };
            return next;
          });
        } catch (err: unknown) {
          const msg = String(err).toLowerCase();
          const isNoPos =
            msg.includes("asset-config-nonexistent") ||
            msg.includes("pool-not-found") ||
            msg.includes("nonexistent") ||
            msg.includes("not found") ||
            msg.includes("revert_error");
          setPositions((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              loading: false,
              error: isNoPos ? null : (err instanceof Error ? err.message : "Failed to load"),
            };
            return next;
          });
        }
      }),
    );
  }, [wallet]);

  // Recompute distance-to-liquidation whenever positions or prices change
  useEffect(() => {
    setPositions((prev) =>
      prev.map((pos) => {
        if (!pos.liquidationPrice) return pos;
        const cgId = COINGECKO_PRICE_IDS[pos.collateral];
        const currentPrice = cgId ? prices[cgId] : null;
        if (!currentPrice) return pos;
        const dist = ((currentPrice - pos.liquidationPrice) / currentPrice) * 100;
        return { ...pos, distanceToLiquidation: dist };
      }),
    );
  }, [prices]);

  useEffect(() => {
    fetchBalances();
    fetchPositions();
    const interval = setInterval(() => {
      fetchBalances();
      fetchPositions();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchBalances, fetchPositions]);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    const fetchPrices = async () => {
      try {
        const res = await fetch("/api/prices");
        const data = await res.json();
        if (cancelled) return;
        // data is a map from coingecko id → { usd: number }
        const next: Record<string, number> = {};
        for (const [id, val] of Object.entries(data as Record<string, any>)) {
          if (typeof val?.usd === "number") next[id] = val.usd;
        }
        setPrices(next);
        setPricesUpdatedAt(Date.now());
      } catch { /* non-fatal */ }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [wallet]);

  // Markets are fetched lazily — only when the user first clicks "Show Markets"
  // This avoids an extra network round-trip on initial dashboard load.
  const handleToggleMarkets = useCallback(() => {
    const next = !showMarkets;
    setShowMarkets(next);
    if (next && !marketsFetched && !marketsLoading && wallet) {
      setMarketsLoading(true);
      wallet.lending().getMarkets()
        .then((m) => setMarkets(Array.isArray(m) ? m : []))
        .catch((err: unknown) => setMarketsError(err instanceof Error ? err.message : "Failed"))
        .finally(() => { setMarketsLoading(false); setMarketsFetched(true); });
    }
  }, [showMarkets, marketsFetched, marketsLoading, wallet]);

  if (!wallet) return null;

  const btcUsd = prices["bitcoin"] ?? null;
  const ethUsd = prices["ethereum"] ?? null;
  const starkUsd = prices["starknet"] ?? null;

  const lastUpdatedLabel = pricesUpdatedAt
    ? Date.now() - pricesUpdatedAt < 60_000
      ? "just now"
      : `${Math.max(1, Math.floor((Date.now() - pricesUpdatedAt) / 60_000))} min ago`
    : "—";

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-200 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <h1 className="text-xl font-bold">
          BTC Health <span className="text-amber-500">Monitor</span>
        </h1>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
            Starknet Mainnet
          </span>
          <button
            type="button"
            onClick={() => router.push("/dashboard/transact")}
            className="text-sm font-medium text-gray-700 hover:text-amber-600"
          >
            Transact
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/alerts")}
            className="text-sm font-medium text-gray-700 hover:text-amber-600"
          >
            Alerts
          </button>
          <span className="text-xs text-gray-400 font-mono">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
          <button type="button" onClick={disconnect} className="text-xs text-red-500 hover:text-red-700">
            Disconnect
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <MonitorHubCard walletId={walletId} />

        {/* Price banner */}
        <div className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex gap-6 text-sm font-semibold text-gray-900">
            <span>BTC {btcUsd === null ? "—" : `$${btcUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</span>
            <span className="text-gray-300">·</span>
            <span>ETH {ethUsd === null ? "—" : `$${ethUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</span>
            <span className="text-gray-300">·</span>
            <span>STRK {starkUsd === null ? "—" : `$${starkUsd.toFixed(4)}`}</span>
          </div>
          <span className="text-xs text-gray-500">Updated: {lastUpdatedLabel}</span>
        </div>

        {/* Wallet Balances */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Wallet Balances</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {loadingBalances
              ? Array.from({ length: balanceSymbols.length }).map((_, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 animate-pulse h-20 border border-gray-100" />
                ))
              : Object.entries(balances).map(([sym, val]) => (
                  <div key={sym} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs text-gray-500">{sym}</p>
                    <p className="text-sm font-semibold truncate">{val}</p>
                  </div>
                ))}
          </div>
        </section>

        {/* Vesu Positions */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Vesu Positions</h2>
            <button
              type="button"
              onClick={() => { fetchBalances(); fetchPositions(); }}
              className="text-sm text-amber-600 hover:text-amber-800 font-medium"
            >
              ↻ Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {positions.filter((p) => !p.error || p.hasDebt).map((pos, i) => {
              const cgId = COINGECKO_PRICE_IDS[pos.collateral];
              const currentPrice = cgId ? prices[cgId] : null;

              return (
                <div key={i} className="border border-gray-200 rounded-2xl p-6 space-y-4 bg-white">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">{pos.collateral} / {pos.debt}</h3>
                      {pos.collateral === "WBTC" && pos.debt === "USDC" && !pos.loading && (
                        <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${
                          autoProtectEnabled ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-gray-50 border-gray-200 text-gray-600"
                        }`}>
                          Auto-protect: {autoProtectEnabled === null ? "—" : autoProtectEnabled ? "ON" : "OFF"}
                        </span>
                      )}
                    </div>
                    {pos.loading ? (
                      <span className="text-xs text-gray-400 animate-pulse">Loading…</span>
                    ) : pos.error ? (
                      <span className="text-xs text-red-400">Error</span>
                    ) : pos.hasDebt ? (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        pos.isCollateralized ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {pos.isCollateralized ? "Safe" : "At Risk"}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No debt</span>
                    )}
                  </div>

                  {/* Health bar */}
                  {pos.hasDebt && !pos.loading && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Health Ratio</span>
                        <span className={`font-bold ${
                          pos.healthRatio > 1.5 ? "text-green-600"
                            : pos.healthRatio > 1.1 ? "text-amber-500"
                            : "text-red-600"
                        }`}>
                          {pos.healthRatio === Infinity ? "∞" : pos.healthRatio.toFixed(3)}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pos.healthRatio > 1.5 ? "bg-green-500"
                              : pos.healthRatio > 1.1 ? "bg-amber-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(100, (Math.min(pos.healthRatio, 2) / 2) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Position values */}
                  {pos.hasDebt && (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Collateral</p>
                        <p className="font-semibold">
                          {fmtToken(pos.collateralAmountHuman, pos.collateralDecimals)} {pos.collateral}
                        </p>
                        <p className="text-xs text-gray-400">{fmtUsd(pos.collateralValueUSD)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Debt</p>
                        <p className="font-semibold">
                          {fmtToken(pos.debtAmountHuman, pos.debtDecimals)} {pos.debt}
                        </p>
                        <p className="text-xs text-gray-400">{fmtUsd(pos.debtValueUSD)}</p>
                      </div>

                      {/* Liquidation price card */}
                      {pos.liquidationPrice !== null && (
                        <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-amber-700 font-medium">
                              {pos.collateral} Price Now
                            </p>
                            <p className="text-sm font-bold text-amber-900">
                              {currentPrice !== null
                                ? `$${currentPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                                : "—"}
                            </p>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-amber-700 font-medium">Liquidation Price</p>
                            <p className="text-sm font-bold text-red-700">
                              ${pos.liquidationPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                          {pos.distanceToLiquidation !== null && (
                            <p className={`text-xs font-semibold ${
                              pos.distanceToLiquidation < 10
                                ? "text-red-700"
                                : pos.distanceToLiquidation < 25
                                  ? "text-amber-700"
                                  : "text-green-700"
                            }`}>
                              {pos.distanceToLiquidation < 0
                                ? "LIQUIDATION ZONE"
                                : `${pos.distanceToLiquidation.toFixed(1)}% drop needed`}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {pos.error && <p className="text-xs text-red-400">{pos.error}</p>}

                  {/* Empty state actions */}
                  {!pos.loading && !pos.hasDebt && !pos.error && (
                    <div>
                      <p className="text-sm text-gray-500">No active position.</p>
                      <div className="flex gap-2 pt-3">
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/transact?action=deposit&token=${pos.collateral}`)}
                          className="flex-1 h-10 bg-amber-500 text-white rounded-xl hover:bg-amber-600 text-sm font-semibold"
                        >
                          Deposit
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Active position actions */}
                  {pos.hasDebt && !pos.loading && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/transact?action=deposit&token=${pos.collateral}`)}
                        className="flex-1 h-11 bg-amber-500 text-white rounded-xl hover:bg-amber-600 text-sm font-semibold"
                      >
                        Add Collateral
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/transact?action=repay&collateral=${pos.collateral}&debt=${pos.debt}`)}
                        className="flex-1 h-11 border border-gray-300 rounded-xl hover:bg-gray-50 text-sm font-semibold"
                      >
                        Repay
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Available Vesu Markets */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Available Vesu Markets</h2>
            <button
              type="button"
              onClick={handleToggleMarkets}
              className="text-sm font-medium text-amber-600 hover:text-amber-800"
            >
              {showMarkets ? "Hide" : "Show"} Markets
            </button>
          </div>

          {showMarkets && (
            <div>
              {marketsError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
                  {marketsError}
                </div>
              )}

              {marketsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-4 animate-pulse h-16" />
                  ))}
                </div>
              ) : markets.length === 0 ? (
                <div className="border border-gray-200 rounded-2xl p-6 bg-white text-sm text-gray-600">
                  No markets found on mainnet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {markets.map((m, i) => {
                    const assetSymbol = m?.asset?.symbol ?? "—";
                    const poolName = m?.poolName ?? m?.poolAddress ?? "—";
                    const canBorrow = Boolean(m?.canBeBorrowed);
                    const vTokenAddr = m?.vTokenAddress ?? m?.asset?.vTokenAddress;

                    return (
                      <div key={i} className="border border-gray-200 rounded-2xl p-5 bg-white space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Asset</p>
                            <p className="font-bold text-lg">{assetSymbol}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Pool</p>
                            <p className="font-semibold text-sm">{String(poolName).slice(0, 24)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <span className={`font-medium ${canBorrow ? "text-green-700" : "text-gray-500"}`}>
                            {canBorrow ? "Can be borrowed" : "Supply only"}
                          </span>
                          {vTokenAddr && (
                            <span className="text-xs text-gray-400 font-mono truncate max-w-24">
                              vToken: {String(vTokenAddr).slice(0, 8)}…
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/transact?action=deposit&token=${assetSymbol}`)}
                          className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition-colors"
                        >
                          Deposit
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
