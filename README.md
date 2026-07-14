# Crypto Exchange Platform

A locally hosted spot cryptocurrency exchange — an educational sandbox modeled after production exchanges (Bybit/Binance class architecture), built with correctness-first financial engineering: a double-entry ledger, an in-house order book and matching engine, and a P2P marketplace.

> **Sandbox only.** No real funds, no mainnet wallets, no custody. All balances are virtual test balances.

## Feature roadmap

| Area | Status |
|---|---|
| Accounts: registration, login, JWT, login lockout, audit trail | ✅ Milestone 1 |
| Assets (BTC, ETH, SOL, USDT) and markets (BTCUSDT, ETHUSDT, SOLUSDT) | ✅ Milestone 1 |
| Double-entry ledger, virtual balances, fund holds | ✅ Milestone 1 |
| Limit orders: placement with fund locking, cancellation | ✅ Milestone 1 |
| Matching engine (price-time priority, partial fills, fees) | 🔜 Milestone 2 |
| Market orders, trade history, live market data (external feed) | 🔜 Milestone 2 |
| Trading UI (React), order book, candlestick charts | 🔜 Milestone 3 |
| Market-maker bot (simulated liquidity) | 🔜 Milestone 3 |
| Deposits/withdrawals simulator, admin panel | 🔜 Milestone 4 |
| P2P marketplace (ads, escrow, disputes) — see [documentation/p2p-design.md](documentation/p2p-design.md) | 🔜 Milestone 5 |
| Email verification, 2FA (TOTP), security hardening | 🔜 Milestone 5 |

## Tech stack

- **Backend:** NestJS + TypeScript, Prisma ORM, PostgreSQL 16, Redis 7
- **Money math:** PostgreSQL `NUMERIC(36,18)` + decimal.js — floats are never used for financial values
- **Auth:** JWT (short-lived access + refresh) with Argon2id password hashing
- **Frontend (upcoming):** React + Vite + TypeScript, Lightweight Charts
- **Infrastructure:** Docker Compose (PostgreSQL, Redis, Adminer)

## Repository layout

```
apps/
  backend/          NestJS API (auth, ledger, orders, markets, ...)
  frontend/         React trading UI (upcoming)
  admin/            Admin panel (upcoming)
packages/
  shared-types/     Enums and API interfaces shared across apps
  validation/       Financial validation rules (decimal.js)
  config/           Shared constants
infrastructure/     Docker/nginx configs for containerized deployment
documentation/      Architecture, ledger design, P2P design, roadmap
```

## Getting started

Prerequisites: Node.js ≥ 20, Docker Desktop.

```bash
# 1. Infrastructure (PostgreSQL, Redis, Adminer)
docker compose up -d

# 2. Environment
copy .env.example .env    # then adjust secrets

# 3. Install & generate
npm install
npm run prisma:generate

# 4. Database schema + seed data (assets, markets)
npm run prisma:migrate
npm run prisma:seed

# 5. Run the API
npm run dev:backend
```

- API: http://localhost:3000/api/health
- Adminer (DB UI): http://localhost:8080 (System: PostgreSQL, Server: postgres, user/pass/db from `.env`)

## Financial correctness guarantees

1. **Double-entry ledger** — every value transfer is a balanced transaction (`Σ debits = Σ credits`), enforced inside the same database transaction. Balances are never mutated directly.
2. **Holds** — placing an order moves funds `available → locked` atomically with a guarded update; cancellation releases the hold. Negative balances are impossible for user accounts.
3. **Exact arithmetic** — all prices/quantities/amounts are `NUMERIC(36,18)` in PostgreSQL and `decimal.js` in application code; serialized as strings over the API.
4. **Auditability** — login attempts, and (upcoming) every admin action and order event, are written to append-only audit tables.

## Testing

```bash
npm test
```

Unit tests cover the ledger invariants (unbalanced transactions are rejected), order validation (tick size, quantity step, minimum notional, insufficient balance) and decimal rules.

## Documentation

- [Architecture overview](documentation/architecture.md)
- [Ledger design](documentation/ledger-design.md)
- [P2P marketplace design](documentation/p2p-design.md)
- [Roadmap](documentation/roadmap.md)
