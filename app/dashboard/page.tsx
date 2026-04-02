"use client";

import { useWallet } from "@/lib/wallet-context";
import { chainDisplayLabel } from "@/lib/chain-label";
import { getDashboardBalanceSymbols, getVesuPositionPairs } from "@/lib/dashboard-config";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import { getPresets } from "starkzap";

interface Position {
  collateral: string;
  debt: string;
  collateralValue: string;
  debtValue: string;
  healthRatio: number;
  isCollateralized: boolean;
  hasDebt: boolean;
  loading: boolean;
  error: string | null;
}

function usdFromScale(value: bigint): string {
  const n = Number(value) / 1e18;
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${n.toFixed(2)}`;
}

export default function Dashboard() {
  const { wallet, address, disconnect } = useWallet();
  const router = useRouter();
  const balanceSymbols = useMemo(() => getDashboardBalanceSymbols(), []);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loadingBalances, setLoadingBalances] = useState(true);

  const [btcUsd, setBtcUsd] = useState<number | null>(null);
  const [starkUsd, setStarkUsd] = useState<number | null>(null);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<number | null>(null);

  const [markets, setMarkets] = useState<any[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [showMarkets, setShowMarkets] = useState(true);
  const [marketsFetched, setMarketsFetched] = useState(false);

  useEffect(() => {
    if (!wallet) router.push("/");
  }, [wallet, router]);

  const fetchBalances = useCallback(async () => {
    if (!wallet) return;
    setLoadingBalances(true);
    try {
      const tokens = getPresets(wallet.getChainId());
      const results: Record<string, string> = {};
      for (const sym of balanceSymbols) {
        const token = tokens[sym];
        if (token) {
          try {
            const bal = await wallet.balanceOf(token);
            results[sym] = bal.toUnit();
          } catch {
            results[sym] = "—";
          }
        }
      }
      setBalances(results);
    } finally {
      setLoadingBalances(false);
    }
  }, [wallet, balanceSymbols]);

  const fetchPositions = useCallback(async () => {
    if (!wallet) return;
    const tokens = getPresets(wallet.getChainId());
    const positionPairs = getVesuPositionPairs();

    const results: Position[] = positionPairs.map((p) => ({
      collateral: p.collateral,
      debt: p.debt,
      collateralValue: "—",
      debtValue: "—",
      healthRatio: Infinity,
      isCollateralized: true,
      hasDebt: false,
      loading: true,
      error: null,
    }));
    setPositions([...results]);

    for (let i = 0; i < positionPairs.length; i++) {
      const pair = positionPairs[i];
      const collateralToken = tokens[pair.collateral];
      const debtToken = tokens[pair.debt];

      // Token doesn't exist on this network — silently skip it
      if (!collateralToken || !debtToken) {
        results[i] = { ...results[i], loading: false };
        setPositions([...results]);
        continue;
      }

      try {
        await wallet.lending().getPosition({ collateralToken, debtToken });
        const health = await wallet.lending().getHealth({ collateralToken, debtToken });

        const colVal = health.collateralValue;
        const dbtVal = health.debtValue;
        const ratio = dbtVal === BigInt(0) ? Infinity : Number(colVal) / Number(dbtVal);

        results[i] = {
          ...results[i],
          collateralValue: usdFromScale(colVal),
          debtValue: usdFromScale(dbtVal),
          healthRatio: ratio,
          isCollateralized: health.isCollateralized,
          hasDebt: dbtVal > BigInt(0),
          loading: false,
        };
      } catch (err: unknown) {
        const msg = String(err).toLowerCase();
        const isNoPos =
          msg.includes("asset-config-nonexistent") ||
          msg.includes("pool-not-found") ||
          msg.includes("nonexistent") ||
          msg.includes("not found") ||
          msg.includes("revert_error");
        if (isNoPos) {
          // Pair doesn't exist in this Vesu pool — show as "no position", not error
          results[i] = { ...results[i], loading: false };
        } else {
          results[i] = {
            ...results[i],
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load",
          };
        }
      }
      setPositions([...results]);
    }
  }, [wallet]);

  useEffect(() => {
    fetchBalances();
    fetchPositions();
    const interval = setInterval(() => {
      fetchBalances();
      fetchPositions();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchBalances, fetchPositions]);

  // BTC/STRK price banner.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;

    const fetchPrices = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,starknet&vs_currencies=usd",
        );
        const data = await res.json();
        if (cancelled) return;

        const nextBtc = data?.bitcoin?.usd ?? null;
        const nextStark = data?.starknet?.usd ?? null;
        setBtcUsd(typeof nextBtc === "number" ? nextBtc : null);
        setStarkUsd(typeof nextStark === "number" ? nextStark : null);
        setPricesUpdatedAt(Date.now());
      } catch (err) {
        // Non-fatal: banner can be blank if the price API fails.
        console.warn("Price fetch failed:", err);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet]);

  // Discover Vesu markets once per session.
  useEffect(() => {
    if (!wallet) return;
    if (marketsFetched) return;
    setMarketsLoading(true);
    setMarketsError(null);
    wallet
      .lending()
      .getMarkets()
      .then((m) => {
        setMarkets(Array.isArray(m) ? m : []);
      })
      .catch((err: unknown) => {
        setMarketsError(err instanceof Error ? err.message : "Failed to load markets");
      })
      .finally(() => {
        setMarketsLoading(false);
        setMarketsFetched(true);
      });
  }, [wallet, marketsFetched]);

  if (!wallet) return null;

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
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
            {chainDisplayLabel(wallet.getChainId())}
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
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
          <button type="button" onClick={disconnect} className="text-xs text-red-500 hover:text-red-700">
            Disconnect
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="text-sm text-gray-900 font-semibold">
            BTC{" "}
            {btcUsd === null
              ? "—"
              : `$${btcUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            {"  ·  "}
            STRK {starkUsd === null ? "—" : `$${starkUsd.toFixed(2)}`}
          </div>
          <div className="text-sm text-gray-600">
            Network: Sepolia · Last updated: {lastUpdatedLabel}
          </div>
        </div>

        <section>
          <h2 className="text-2xl font-bold mb-4">Wallet Balances</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loadingBalances
              ? Array.from({ length: Math.max(1, balanceSymbols.length) }).map((_, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 animate-pulse h-20 border border-gray-100" />
                ))
              : Object.entries(balances).map(([sym, val]) => (
                  <div key={sym} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-sm text-gray-500">{sym}</p>
                    <p className="text-lg font-semibold">{val}</p>
                  </div>
                ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Vesu Positions</h2>
            <button
              type="button"
              onClick={() => {
                fetchBalances();
                fetchPositions();
              }}
              className="text-sm text-amber-600 hover:text-amber-800 font-medium"
            >
              ↻ Refresh
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {positions.filter((pos) => !pos.error || pos.hasDebt).map((pos, i) => {
              const collateralBal = Number(balances[pos.collateral]);
              const hasCollateral = Number.isFinite(collateralBal) && collateralBal > 0;

              return (
                <div key={i} className="border border-gray-200 rounded-2xl p-6 space-y-4 bg-white">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">
                      {pos.collateral} / {pos.debt}
                    </h3>
                    {pos.loading ? (
                      <span className="text-xs text-gray-400">Loading...</span>
                    ) : pos.error ? (
                      <span className="text-xs text-red-400">Error</span>
                    ) : pos.hasDebt ? (
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          pos.isCollateralized ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {pos.isCollateralized ? "Safe" : "At Risk"}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No debt</span>
                    )}
                  </div>

                  {pos.hasDebt && !pos.loading && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">Health Ratio</span>
                        <span
                          className={`font-bold ${
                            pos.healthRatio > 1.5
                              ? "text-green-600"
                              : pos.healthRatio > 1.1
                                ? "text-amber-500"
                                : "text-red-600"
                          }`}
                        >
                          {pos.healthRatio === Infinity ? "∞" : pos.healthRatio.toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pos.healthRatio > 1.5
                              ? "bg-green-500"
                              : pos.healthRatio > 1.1
                                ? "bg-amber-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(100, (pos.healthRatio / 2) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {pos.hasDebt && (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Collateral</p>
                        <p className="font-semibold">{pos.collateralValue}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Debt</p>
                        <p className="font-semibold">{pos.debtValue}</p>
                      </div>
                    </div>
                  )}

                  {pos.error && <p className="text-xs text-red-400">{pos.error}</p>}

                  {!pos.loading && !pos.hasDebt && !pos.error && (
                    <div>
                      {hasCollateral ? (
                        <p className="text-sm text-gray-600">
                          You have {collateralBal.toFixed(2)} {pos.collateral} available. Start earning by depositing.
                        </p>
                      ) : (
                        <p className="text-sm text-gray-600">Get {pos.collateral} to start.</p>
                      )}

                      <div className="flex gap-2 pt-3">
                        {hasCollateral ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/dashboard/transact?action=deposit&token=${pos.collateral}`)
                            }
                            className="flex-1 h-14 text-lg bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-semibold"
                          >
                            Deposit
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/dashboard/transact?action=swap&tokenOut=${pos.collateral}`)
                            }
                            className="flex-1 h-14 text-lg border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
                          >
                            Swap to {pos.collateral}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {pos.hasDebt && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/dashboard/transact?action=deposit&token=${pos.collateral}`)
                        }
                        className="flex-1 h-14 text-lg bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-semibold"
                      >
                        Add Collateral
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/dashboard/transact?action=repay&collateral=${pos.collateral}&debt=${pos.debt}`,
                          )
                        }
                        className="flex-1 h-14 text-lg border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
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

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Available Vesu Markets</h2>
            <button
              type="button"
              onClick={() => setShowMarkets((s) => !s)}
              className="text-sm font-medium text-amber-600 hover:text-amber-800"
            >
              Discover Markets
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
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl p-4 animate-pulse h-16" />
                  ))}
                </div>
              ) : markets.length === 0 ? (
                <div className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm text-sm text-gray-600">
                  No markets found on this network.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {markets.map((m, i) => {
                    const assetSymbol = m?.asset?.symbol ?? "—";
                    const poolName = m?.poolName ?? m?.poolAddress ?? "—";
                    const canBorrow = Boolean(m?.canBeBorrowed);

                    return (
                      <div key={i} className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-gray-500">Asset</p>
                            <p className="font-semibold">{assetSymbol}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">Pool</p>
                            <p className="font-semibold">{String(poolName)}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">
                            Can be borrowed:{" "}
                            <span className={`font-semibold ${canBorrow ? "text-green-700" : "text-gray-700"}`}>
                              {canBorrow ? "Yes" : "No"}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => router.push(`/dashboard/transact?action=deposit&token=${assetSymbol}`)}
                            className="h-14 px-4 bg-amber-500 hover:bg-amber-600 text-white text-lg font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-wait"
                          >
                            Deposit
                          </button>
                        </div>
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
