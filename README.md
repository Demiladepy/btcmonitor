# BTC Health Monitor

Real-time liquidation monitoring for Bitcoin positions on Vesu (Starknet).

## What it does

- Connect with email, social login (Cartridge), or Argent / Braavos
- Monitor WBTC, LBTC, TBTC, and ETH positions on Vesu in real time
- See health ratios, liquidation prices, and distance to liquidation
- Swap, deposit, borrow, and repay with `feeMode: "sponsored"` (AVNU paymaster)
- Telegram and email alerts when positions approach liquidation
- Background monitoring via Vercel Cron (`/api/cron/monitor`)

## Built with Starkzap

Every blockchain interaction uses the [Starkzap](https://www.npmjs.com/package/starkzap) SDK:

- `sdk.onboard()` — Privy + Cartridge wallet connection
- `wallet.lending().getPosition()` — Vesu position reads
- `wallet.lending().getHealth()` — health ratio checks
- `wallet.lending().quoteHealth()` — borrow impact before you sign
- `wallet.lending().deposit()` / `borrow()` / `repay()` — Vesu interactions
- `wallet.swap()` — AVNU token swaps
- `wallet.transfer()` — token sends
- `feeMode: "sponsored"` — gasless transactions where the paymaster applies

## Live demo

_Add your deployed Vercel URL here._

## Quick start

```bash
git clone https://github.com/Demiladepy/btcmonitor.git
cd btcmonitor
npm install
cp .env.example .env
# Fill in keys (Privy, DATABASE_URL, AVNU paymaster, etc.)
npx prisma migrate deploy
npm run dev
```

> This repository may be named `btchealth` locally; use your actual Git remote if it differs.

## Architecture

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Plus Jakarta Sans
- **Chain:** Starkzap SDK on Starknet mainnet
- **Auth:** Privy (email) + Cartridge (controller) + StarknetKit (Argent / Braavos)
- **Data:** PostgreSQL + Prisma (alert preferences, history, Telegram link codes)
- **Monitoring:** Vercel Cron → `GET /api/cron/monitor`
- **Alerts:** Telegram Bot API + Resend email

## Health check

`GET /api/health` returns JSON with `status: "ok"` and booleans for configured services (Privy, paymaster, monitor, Telegram, email).

## Screenshots

_Add 3–4 screenshots: landing page, dashboard with positions, Transact page, Alerts page._

## Demo video

_Add a 30s YouTube or Loom link here (sign-in → dashboard → position → swap → alerts → Telegram)._

## Ecosystem

To list this project under community demos, open a PR to [awesome-starkzap](https://github.com/keep-starknet-strange/awesome-starkzap) with a short description and link to this repo.

## License

MIT
