import { useState } from "react";
import { Amount } from "starkzap";
import type { Wallet, Token, Address } from "starkzap";

interface Props {
  wallet: Wallet;
  collateralToken: Token;
  onComplete: () => void;
}

export function DepositWithdrawPanel({ wallet, collateralToken, onComplete }: Props) {
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exec(label: string, action: () => Promise<{ wait: () => Promise<unknown> }>) {
    setError(null);
    setPending(label);
    try {
      const tx = await action();
      await tx.wait();
      setAmount("");
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const hasAmount = !!amount && parseFloat(amount) > 0;

  return (
    <div className="card">
      <div className="card-title">Collateral — {collateralToken.symbol}</div>

      <div className="input-group">
        <div className="input-label">Amount</div>
        <div className="amount-wrap">
          <input
            type="number"
            className="amount-input"
            min="0" step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.000"
          />
          <div className="amount-token">{collateralToken.symbol}</div>
        </div>
      </div>

      <div className="dw-buttons">
        <button
          className="btn-primary"
          onClick={() => exec("deposit", () => wallet.lending().deposit(
            { token: collateralToken, amount: Amount.parse(amount, collateralToken) },
            { feeMode: "sponsored" }
          ))}
          disabled={!!pending || !hasAmount}
        >
          {pending === "deposit" ? <><span className="spinner-sm" />Depositing…</> : "Deposit"}
        </button>
        <button
          className="btn-secondary"
          onClick={() => exec("withdraw", () => wallet.lending().withdraw(
            { token: collateralToken, amount: Amount.parse(amount, collateralToken) },
            { feeMode: "sponsored" }
          ))}
          disabled={!!pending || !hasAmount}
        >
          {pending === "withdraw" ? <><span className="spinner-sm" />Withdrawing…</> : "Withdraw"}
        </button>
        <button
          className="btn-ghost"
          onClick={() => exec("withdrawMax", () => wallet.lending().withdrawMax(
            { token: collateralToken, receiver: wallet.address as Address },
            { feeMode: "sponsored" }
          ))}
          disabled={!!pending}
        >
          {pending === "withdrawMax" ? <><span className="spinner-sm" />…</> : "Max"}
        </button>
      </div>

      {error && <p className="error-text" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}
