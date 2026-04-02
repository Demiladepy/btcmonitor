# BTC Health Monitor

> The first DeFi risk management dashboard built on Starkzap v2 — monitor your Vesu lending positions, simulate actions before signing, and get DM alerts before liquidation.

## What it does

Deposit ETH or BTC as collateral into Vesu lending pools on Starknet, borrow USDC against it, and monitor your health ratio in real time. The live borrow/repay simulator previews exactly how each action will change your position *before* you sign. Push alerts fire when your ratio drops toward liquidation — via browser notification **and** direct Telegram or email messages.

## Technical highlights

- `wallet.lending().quoteHealth()` — simulates borrow/repay impact BEFORE the user signs. Shows projected health ratio live as they type the amount (400ms debounce). Both current and projected arcs render simultaneously in the SVG gauge.
- `wallet.lending().getPosition()` + `getHealth()` — polled every 15s for real-time collateralization state
- `wallet.lending().getMarkets()` — discovers all available Vesu pools dynamically, renders a switchable market table
- Full Vesu lending stack: deposit, borrow, repay, withdrawMax — all gasless via AVNU paymaster (`feeMode: "sponsored"`)
- Sessionless wallet: 248-bit Stark-safe private key generated with `crypto.getRandomValues()`, stored in `localStorage` — same address on every reload, no seed phrase
- **DM Alert System**: Vercel serverless functions post to Telegram Bot API and Resend (email) when health drops below threshold or recovers — bot tokens never exposed to browser
- 5-minute client-side + server-side rate limiting prevents alert spam
- Push alerts via Web Notifications API when health ratio crosses user-defined threshold (stored in `localStorage`)
- 48-point health history ring buffer with Recharts area chart

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
wallet.lending().getMaxBorrowAmount()
```

## Stack

- React + Vite + TypeScript
- [starkzap](https://www.npmjs.com/package/starkzap) — Starknet SDK
- [recharts](https://recharts.org) — health history chart
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) — Telegram DM alerts (server-side)
- [resend](https://resend.com) — email alerts (server-side)
- [@vercel/node](https://vercel.com/docs/functions/runtimes/node-js) — serverless API functions

## How to run

```bash
npm install
cp .env .env.local   # fill in your tokens (see below)
npm run dev
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | For Telegram alerts | Create via [@BotFather](https://t.me/BotFather) |
| `RESEND_API_KEY` | For email alerts | Get from [resend.com](https://resend.com) |
| `VITE_APP_URL` | Optional | Your deployed URL for links in alert messages |

> All sensitive keys are server-side only (no `VITE_` prefix). They are never bundled into the browser.

## Setting up Telegram alerts

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts — copy the token
3. Add it to `.env` as `TELEGRAM_BOT_TOKEN=<token>`
4. Start a chat with your new bot
5. Find your personal **Chat ID** via [@userinfobot](https://t.me/userinfobot)
6. In the app, open the **DM Alerts** panel → paste your Chat ID → Save

## Deploy

```bash
npm run build
vercel deploy --prod
# Set TELEGRAM_BOT_TOKEN and RESEND_API_KEY in Vercel → Settings → Environment Variables
```

The `api/` directory is automatically detected by Vercel as serverless functions.

## Architecture notes

**Wallet**: A 248-bit Stark-safe private key is generated with `crypto.getRandomValues(31 bytes)` and stored in `localStorage`. This gives users a deterministic address across sessions without a seed phrase. Call `disconnect()` to clear and regenerate.

**Health ratio**: `collateralValue / debtValue` where both values are USD-denominated on a `1e18` scale from Vesu. Ratio `> 1.5` = safe, `1.2–1.5` = at risk, `< 1.2` = danger. Liquidation occurs at `1.0`.

**Alert flow**: `useAlerts` detects threshold crossings → calls `sendAlert` from `useNotifications` → POSTs to `/api/send-telegram` or `/api/send-email` → Vercel serverless function delivers the message. Rate limited to once per 5 minutes per alert type, both client-side (localStorage) and server-side (in-memory map).

**Token pair**: Defaults to ETH/USDC on Sepolia. After `getMarkets()` logs the pool list, swap `COLLATERAL_TOKEN` in `src/lib/tokens.ts` to WBTC/tBTC if available.

## Judge demo (bounty checklist)
1. Set environment variables:
   - `PRIVY_APP_ID` / `PRIVY_APP_SECRET`
   - `DATABASE_URL`
   - `MONITOR_PRIVATE_KEY` (worker read-only health checks + position reads)
   - `NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY` (AVNU sponsored transactions)
   - `TELEGRAM_BOT_TOKEN` (Telegram bot)
2. Sign in (landing page) to create/reuse your wallet.
3. Ensure your wallet has a `WBTC/USDC` position with debt:
   - Deposit WBTC as collateral
   - Borrow USDC so you can repay later
4. Open `Alerts`:
   - Set thresholds (especially `Critical Threshold`) so it’s easy to reach critical health during the demo
   - Toggle `Auto-protect (MVP)` ON
5. Connect Telegram (Alerts page -> Connect Telegram -> send `/start`).
6. Trigger critical health:
   - Use `Transact` -> borrow more (or other actions) until health becomes critical
   - Wait up to 1 minute for the worker, OR use Telegram `/repay` as a manual trigger
7. Verify:
   - Telegram message includes an execution note and tx hash
   - `Alerts` -> Alert History shows a new critical record for `WBTC/USDC`
