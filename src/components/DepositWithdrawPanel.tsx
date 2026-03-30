import { useState } from "react";
import { Amount } from "starkzap";
import type { Wallet, Token, Address } from "starkzap";
import type { useToast } from "../hooks/useToast";

interface Props {
  wallet: Wallet;
  collateralToken: Token;
  poolAddress: string | null;
  onComplete: () => void;
  toast: ReturnType<typeof useToast>;
}

export function DepositWithdrawPanel({ wallet, collateralToken, poolAddress, onComplete, toast }: Props) {
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function exec(
    label: string,
    verb: string,
    action: () => Promise<{ wait: () => Promise<unknown> }>
  ) {
    setPending(label);
    const id = toast.add("pending", `${verb}…`);
    try {
      const tx = await action();
      toast.update(id, "pending", "Waiting for confirmation…");
      await tx.wait();
      toast.update(id, "success", `${verb} confirmed ✓`);
      setAmount("");
      onComplete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.update(id, "error", msg.length > 80 ? msg.slice(0, 80) + "…" : msg);
    } finally {
      setPending(null);
    }
  }

  const pool = poolAddress as Address | undefined;
  const hasAmount = !!amount && parseFloat(amount) > 0;

  return (
    <div className="card">
      <div className="card-title">Manage Collateral — {collateralToken.symbol}</div>

      <div className="input-group">
        <div className="input-label">Amount</div>
        <div className="amount-wrap">
          <input
            type="number" className="amount-input"
            min="0" step="0.001" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.000"
          />
          <div className="amount-token">{collateralToken.symbol}</div>
        </div>
      </div>

      <div className="dw-buttons">
        <button
          className="btn-primary"
          disabled={!!pending || !hasAmount || !poolAddress}
          onClick={() => exec("deposit", `Depositing ${amount} ${collateralToken.symbol}`, () =>
            wallet.lending().deposit(
              { token: collateralToken, amount: Amount.parse(amount, collateralToken), poolAddress: pool },
              { feeMode: "sponsored" }
            )
          )}
        >
          {pending === "deposit" ? <><span className="spinner-sm" />Depositing…</> : "Deposit"}
        </button>
        <button
          className="btn-secondary"
          disabled={!!pending || !hasAmount || !poolAddress}
          onClick={() => exec("withdraw", `Withdrawing ${amount} ${collateralToken.symbol}`, () =>
            wallet.lending().withdraw(
              { token: collateralToken, amount: Amount.parse(amount, collateralToken), poolAddress: pool },
              { feeMode: "sponsored" }
            )
          )}
        >
          {pending === "withdraw" ? <><span className="spinner-sm" />Withdrawing…</> : "Withdraw"}
        </button>
        <button
          className="btn-ghost"
          disabled={!!pending || !poolAddress}
          onClick={() => exec("withdrawMax", `Withdrawing all ${collateralToken.symbol}`, () =>
            wallet.lending().withdrawMax(
              { token: collateralToken, receiver: wallet.address as Address, poolAddress: pool },
              { feeMode: "sponsored" }
            )
          )}
        >
          {pending === "withdrawMax" ? <><span className="spinner-sm" />…</> : "Withdraw Max"}
        </button>
      </div>
    </div>
  );
}
