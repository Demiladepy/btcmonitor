import { useState } from "react";
import { Amount, fromAddress } from "starkzap";
import type { Wallet } from "starkzap";
import { sepoliaTokens } from "../lib/tokens";
import type { useToast } from "../hooks/useToast";

interface Props {
  wallet: Wallet;
  toast: ReturnType<typeof useToast>;
}

const SEND_TOKENS = [
  { label: "ETH",  token: sepoliaTokens.ETH  },
  { label: "USDC", token: sepoliaTokens.USDC },
  { label: "STRK", token: sepoliaTokens.STRK },
];

export function SendPanel({ wallet, toast }: Props) {
  const [tokenIdx, setTokenIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [pending, setPending] = useState(false);

  const selected = SEND_TOKENS[tokenIdx];

  async function handleSend() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || !recipient.trim()) return;

    let toAddr: ReturnType<typeof fromAddress>;
    try {
      toAddr = fromAddress(recipient.trim());
    } catch {
      toast.add("error", "Invalid recipient address");
      return;
    }

    setPending(true);
    const id = toast.add("pending", `Sending ${amount} ${selected.label}…`);
    try {
      const tx = await wallet.transfer(
        selected.token,
        [{ to: toAddr, amount: Amount.parse(amount, selected.token) }],
        { feeMode: "sponsored" }
      );
      toast.update(id, "pending", "Waiting for confirmation…");
      await tx.wait();
      toast.update(id, "success", `Sent ${amount} ${selected.label} ✓`);
      setAmount("");
      setRecipient("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.update(id, "error", msg.length > 80 ? msg.slice(0, 80) + "…" : msg);
    } finally {
      setPending(false);
    }
  }

  const canSend = !pending && !!amount && parseFloat(amount) > 0 && !!recipient.trim();

  return (
    <div className="card">
      <div className="card-title">Send Tokens</div>

      {/* Token selector */}
      <div className="input-group">
        <div className="input-label">Token</div>
        <div style={{ display: "flex", gap: 8 }}>
          {SEND_TOKENS.map((t, i) => (
            <button
              key={t.label}
              onClick={() => { setTokenIdx(i); setAmount(""); }}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${i === tokenIdx ? "var(--accent)" : "var(--border)"}`,
                background: i === tokenIdx ? "var(--accent-dim)" : "var(--surface)",
                color: i === tokenIdx ? "var(--accent)" : "var(--text2)",
                fontWeight: i === tokenIdx ? 700 : 400, fontSize: 13,
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="input-group">
        <div className="input-label">Amount</div>
        <div className="amount-wrap">
          <input
            type="number" className="amount-input"
            min="0" step="0.0001" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0000"
          />
          <div className="amount-token">{selected.label}</div>
        </div>
      </div>

      {/* Recipient */}
      <div className="input-group">
        <div className="input-label">Recipient Address</div>
        <input
          className="input"
          type="text"
          placeholder="0x..."
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          style={{ fontFamily: "var(--mono)", fontSize: 12 }}
        />
      </div>

      <button
        className="btn-primary btn-full"
        disabled={!canSend}
        onClick={handleSend}
      >
        {pending
          ? <><span className="spinner-sm" />Sending…</>
          : `Send ${amount || "0"} ${selected.label}`}
      </button>

      <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
        ⛽ Gasless via AVNU paymaster
      </div>
    </div>
  );
}
