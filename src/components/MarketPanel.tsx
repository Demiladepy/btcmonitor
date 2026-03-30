import type { LendingMarket, Token } from "starkzap";

interface Props {
  markets: LendingMarket[];
  loading: boolean;
  activeCollateral: Token;
  activeDebt: Token;
  activePool: string | null;
  onSelectMarket: (collateral: Token, poolAddress: string) => void;
}

function fmtApy(val: unknown): string {
  if (!val) return "—";
  try {
    if (typeof val === "object" && val !== null && "toUnit" in val) {
      const n = parseFloat((val as { toUnit: () => string }).toUnit()) * 100;
      return n.toFixed(2) + "%";
    }
  } catch {}
  return "—";
}

export function MarketPanel({ markets, loading, activeCollateral, activePool, onSelectMarket }: Props) {
  if (loading) {
    return (
      <div className="card">
        <div className="card-title">Markets</div>
        <div className="skeleton-rows">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton-row" />)}
        </div>
      </div>
    );
  }

  if (!markets.length) return null;

  return (
    <div className="card">
      <div className="card-title">Available Markets</div>
      <table className="market-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Pool</th>
            <th>Borrow</th>
            <th>Supply APY</th>
            <th>Borrow APR</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m: LendingMarket) => {
            const isActivePool = m.poolAddress.toLowerCase() === activePool?.toLowerCase();
            const isActiveAsset = m.asset.address.toLowerCase() === activeCollateral.address.toLowerCase();
            const isActive = isActivePool && isActiveAsset;
            return (
              <tr
                key={`${m.poolAddress}-${m.asset.address}`}
                className={isActive ? "row-active" : ""}
              >
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isActive && <div className="dot dot-green" />}
                    <strong>{m.asset.symbol}</strong>
                  </div>
                </td>
                <td className="muted small">
                  {m.poolName ?? m.poolAddress.slice(0, 6) + "…" + m.poolAddress.slice(-4)}
                </td>
                <td>{m.canBeBorrowed ? <span style={{ color: "var(--green)" }}>✓</span> : <span className="muted">—</span>}</td>
                <td>{fmtApy(m.stats?.supplyApy)}</td>
                <td>{fmtApy(m.stats?.borrowApr)}</td>
                <td>
                  <button
                    className="btn-ghost small"
                    disabled={isActive}
                    onClick={() => onSelectMarket(m.asset, m.poolAddress)}
                    style={isActive ? { color: "var(--green)" } : {}}
                  >
                    {isActive ? "Active" : "Use"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
