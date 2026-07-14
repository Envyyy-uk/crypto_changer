# Roadmap

## Milestone 1 — Foundation (current)

- [x] Monorepo, Docker Compose (PostgreSQL, Redis, Adminer)
- [x] NestJS backend, `/api/health`
- [x] Prisma schema: users, login audit, assets, markets, accounts, ledger, holds, orders
- [x] Registration (Argon2id) + 100 000 test USDT via double-entry ledger
- [x] Login: JWT access/refresh, lockout after 5 failed attempts, login audit
- [x] Assets: BTC, ETH, SOL, USDT; markets: BTCUSDT, ETHUSDT, SOLUSDT (seed)
- [x] Balances API (available/locked)
- [x] Limit orders: validation (tick size, quantity step, min notional), fund locking, cancellation
- [x] Unit tests: ledger invariants, order validation, decimal rules

## Milestone 2 — Trading core

- [ ] Order book per market (price-time priority)
- [ ] Matching engine: limit crossing, partial fills, market orders across levels
- [ ] Trades: fills, maker/taker fees to `FEE_REVENUE`, self-trade prevention
- [ ] Idempotency keys, max order size, max price deviation
- [ ] External market data feed (public WS), candles (1m…1d), staleness marking
- [ ] Exchange WebSocket: prices, order book, trades, balance/order updates

## Milestone 3 — Trading experience

- [ ] React frontend: login/register, markets, trade page (chart, book, form, history), wallet
- [ ] Market-maker bot (system user, quotes around external price, flagged as simulated liquidity)
- [ ] Mobile access over LAN

## Milestone 4 — Operations

- [ ] Deposit/withdrawal simulator (ledger-backed, statuses)
- [ ] Admin panel: users, markets, balances (adjustments via ledger only), MM control
- [ ] Full audit trail; testnet adapters (Anvil ERC-20, Bitcoin regtest) — optional

## Milestone 5 — P2P & account security

- [ ] P2P marketplace per [p2p-design.md](p2p-design.md): ads, escrow, chat, disputes, moderation
- [ ] Email verification (Mailpit), 2FA (TOTP + backup codes)
- [ ] Refresh token rotation & persistence, security hardening pass, e2e suite (Playwright)
