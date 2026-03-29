# BTC Health Monitor

> The first DeFi risk management dashboard built on Starkzap v2 — monitor your Vesu lending positions, simulate actions before signing, and get alerts before liquidation.

## What it does

Deposit ETH or BTC as collateral into Vesu lending pools on Starknet, borrow USDC against it, and monitor your health ratio in real time. The live borrow/repay simulator previews exactly how each action will change your position *before* you sign. Push alerts fire when your ratio drops toward liquidation.

## Technical highlights

- `wallet.lending().quoteHealth()` — simulates borrow/repay impact BEFORE the user signs. Shows projected health ratio live as they type the amount (400ms debounce). Both current and projected arcs render simultaneously in the SVG gauge.
- `wallet.lending().getPosition()` + `getHealth()` — polled every 15s for real-time collateralization state
- `wallet.lending().getMarkets()` — discovers all available Vesu pools dynamically, renders a switchable market table
- Full Vesu lending stack: deposit, borrow, repay, withdrawMax — all gasless via AVNU paymaster (`feeMode: "sponsored"`)
- Privy social login — users sign in with Google, no seed phrase required
- Push alerts via Web Notifications API when health ratio crosses user-defined threshold (stored in localStorage)
- 48-point health history ring buffer with Recharts line chart

## SDK APIs used

```
wallet.lending().getMarkets()
wallet.lending().getPosition()
wallet.lending().getHealth()
wallet.lending().quoteHealth()
wallet.lending().deposit()
wallet.lending().borrow()
wallet.lending().repay()
wallet.lending().withdrawMax()
```

## Stack

- React + Vite + TypeScript
- [starkzap](https://www.npmjs.com/package/starkzap) — Starknet SDK
- [@privy-io/react-auth](https://www.npmjs.com/package/@privy-io/react-auth) — social login
- [recharts](https://recharts.org) — health history chart

## How to run

```bash
npm install
cp .env.example .env   # add VITE_PRIVY_APP_ID from dashboard.privy.io
npm run dev
```

## Deploy

```bash
npm run build
vercel deploy --prod
# Set VITE_PRIVY_APP_ID in Vercel environment variables
```

## Architecture notes

**Wallet integration**: After Privy Google login, the app connects a Starknet ArgentX account via `StarkSigner`. In production, swap `StarkSigner` for `PrivySigner` using Privy's embedded Starknet wallet:

```ts
const signer = new PrivySigner({
  walletId: privyWallet.id,
  publicKey: privyWallet.public_key,
  rawSign: async (walletId, hash) => { /* call Privy rawSign */ }
});
```

**Health ratio**: `collateralValue / debtValue` where both values are USD-denominated on a `1e18` scale from Vesu. Ratio `> 1.5` = safe, `1.2–1.5` = at risk, `< 1.2` = danger. Liquidation occurs at `1.0`.

**Token pair**: Defaults to ETH/USDC on Sepolia. After `getMarkets()` logs the pool list, swap `COLLATERAL_TOKEN` in `src/lib/tokens.ts` to WBTC/tBTC if available.
