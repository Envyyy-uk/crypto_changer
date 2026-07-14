# Architecture Overview

## System shape

Monorepo (npm workspaces). One NestJS backend exposes a REST API under `/api`; PostgreSQL is the source of truth; Redis is provisioned for caching/pub-sub (used from Milestone 2 for market data fan-out). The frontend, admin panel and market-maker bot are separate apps added in later milestones.

```
┌────────────┐   REST/WS   ┌───────────────────────────────┐
│  Frontend  │ ──────────► │           Backend (NestJS)     │
│  (React)   │             │                                │
└────────────┘             │  auth ── users ── audit        │
┌────────────┐             │  assets ── markets             │
│   Admin    │ ──────────► │  ledger ── balances ── holds   │
└────────────┘             │  orders ── matching ── trades  │
┌────────────┐             │  market-data                   │
│ MM bot (M3)│ ──────────► │  wallets (M4) ── p2p (M5)      │
└────────────┘             └───────┬────────────────┬───────┘
                                   │                │
                             PostgreSQL          Redis
```

## Backend modules

| Module | Responsibility | Status |
|---|---|---|
| `auth` | Registration, login, JWT issuance/refresh, lockout | M1 |
| `users` | User profile, roles, statuses | M1 |
| `assets` | Asset registry (BTC/ETH/SOL/USDT) | M1 |
| `markets` | Trading pairs, tick size / step / notional / fee config | M1 |
| `ledger` | Double-entry transactions, system accounts | M1 |
| `balances` | Per-user per-asset available/locked, fund holds | M1 |
| `orders` | Order placement/cancellation, validation (LIMIT + MARKET) | M1/M2 |
| `matching` | Per-market price-time priority engine, settlement (fills, fees, holds) | M2 |
| `trades` | Executions, fills, fee records | M2 |
| `market-data` | External price feed ingestion, candles, WS fan-out | M2 |
| `wallets` | Deposit/withdrawal simulator, later testnet adapters | M4 |
| `admin` | User/market management, balance adjustments via ledger | M4 |
| `p2p` | P2P marketplace: ads, escrow, disputes ([design](p2p-design.md)) | M5 |
| `notifications` | Email/web notifications | M5 |
| `audit` | Append-only audit trail | M1 (login audit) → M4 (full) |

## Key decisions

1. **All financial values are exact decimals.** PostgreSQL `NUMERIC(36,18)`, `decimal.js` in application code, strings on the wire. JS `number` is never used for money.
2. **Balances are derived, never assigned.** Every balance change flows through the ledger (`ledger_transactions`/`ledger_entries`) or a hold (`holds`). There is no code path that sets `available = X`.
3. **Concurrency safety at the database.** Guarded atomic updates (`UPDATE ... WHERE available >= amount`) inside serializable Prisma transactions prevent double-spends without application-level locks.
4. **Matching engine is a module first, a service later.** Milestone 2 implements price-time priority matching in-process; if throughput demands it, it can be extracted to Go/Rust behind the same interface.
5. **snake_case physical schema.** Prisma models map to snake_case tables (`@@map`) so the database reads like a conventional financial schema.
