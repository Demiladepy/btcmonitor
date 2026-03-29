import type { LendingMarket, Token } from "starkzap";
import { useLendingMarkets } from "../hooks/useLendingMarkets";
import type { Wallet } from "starkzap";

interface Props {
  wallet: Wallet;
  activeCollateral: Token;
  activeDebt: Token;
  onSelectMarket: (collateral: Token, debt: Token) => void;
}

function apy(val: unknown): string {
  if (!val) return "—";
  // Amount object
  if (typeof val === "object" && val !== null && "toUnit" in val) {
    return `${(parseFloat((val as { toUnit: () => string }).toUnit()) * 100).toFixed(2)}%`;
  }
  return "—";
}

export function MarketPanel({ wallet, activeCollateral, activeDebt, onSelectMarket }: Props) {
  const { markets, loading } = useLendingMarkets(wallet);

  if (loading) {
    return (
      <div className="card market-panel">
        <h3 className="card-title">Markets</h3>
        <div className="skeleton-rows">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card market-panel">
      <h3 className="card-title">Markets</h3>
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
            const isActive =
              m.asset.address.toLowerCase() ===
              activeCollateral.address.toLowerCase();
            return (
              <tr key={`${m.poolAddress}-${m.asset.address}`} className={isActive ? "row-active" : ""}>
                <td>{m.asset.symbol}</td>
                <td className="muted small">{m.poolName ?? m.poolAddress.slice(0, 8) + "…"}</td>
                <td>{m.canBeBorrowed ? "✓" : "—"}</td>
                <td>{apy(m.stats?.supplyApy)}</td>
                <td>{apy(m.stats?.borrowApr)}</td>
                <td>
                  {m.canBeBorrowed && (
                    <button
                      className="btn-ghost small"
                      onClick={() => onSelectMarket(m.asset, activeDebt)}
                      disabled={isActive}
                    >
                      {isActive ? "Active" : "Use"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
