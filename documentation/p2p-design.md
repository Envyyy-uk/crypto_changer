# P2P Marketplace — Design (Milestone 5)

A Binance-P2P-style over-the-counter marketplace where users trade crypto against (simulated) fiat payments directly with each other, with the exchange acting as **escrow agent** — never as counterparty.

## Concepts

- **Ad (advertisement)** — a standing offer by a *maker*: "I sell up to 0.5 BTC at 60 200 USDT-equivalent, min order 100, max 5 000, payment: bank transfer".
- **P2P order** — a *taker* accepts an ad for a specific amount. The crypto side is locked in escrow; the fiat side is settled off-platform (simulated in the sandbox by a "mark as paid" action).
- **Escrow** — a SYSTEM ledger account (`P2P_ESCROW`, per asset). Escrow uses the same double-entry ledger as spot trading — no special balance logic.
- **Dispute** — either party can escalate; a `SUPPORT`/`ADMIN` moderator resolves by releasing escrow to one side.

## Data model (Prisma, added in M5)

```
p2p_payment_methods   id, user_id, type (BANK_TRANSFER|CARD|...), details(json), enabled
p2p_ads               id, maker_id, side (BUY|SELL), asset_id, fiat_currency,
                      price, min_amount, max_amount, total_remaining,
                      payment_method_types[], terms, status (ACTIVE|PAUSED|CLOSED)
p2p_orders            id, ad_id, taker_id, amount_asset, amount_fiat,
                      status, escrow_hold_tx_id, paid_at, released_at, expires_at
p2p_messages          id, order_id, sender_id, body, created_at        (order chat)
p2p_disputes          id, order_id, opened_by, reason, status, resolved_by, resolution
```

## Order state machine

```
CREATED ──(seller's crypto moved to escrow)──► ESCROWED
ESCROWED ──(buyer marks paid)──► PAID
PAID ──(seller confirms receipt)──► RELEASED   ✅ escrow → buyer
ESCROWED/PAID ──(timeout or party)──► DISPUTED ──(moderator)──► RELEASED or REFUNDED
CREATED/ESCROWED ──(timeout/cancel before PAID)──► CANCELLED  (escrow → seller)
```

Ledger events:
- **Escrow:** DEBIT seller user account / CREDIT `P2P_ESCROW` (type `P2P_ESCROW`).
- **Release:** DEBIT `P2P_ESCROW` / CREDIT buyer (type `P2P_RELEASE`), plus optional maker fee leg to `FEE_REVENUE`.
- **Refund:** DEBIT `P2P_ESCROW` / CREDIT seller (type `P2P_REFUND`).

## Safety rules

- Seller's crypto is escrowed *before* the buyer is told to pay; release only by seller confirmation or moderator decision.
- Timeouts: unpaid orders auto-cancel (15 min default); paid-but-unreleased orders auto-escalate to dispute (30 min default).
- All state transitions are audited; chat is retained for dispute evidence.
- Rate limits per user on ad creation and order creation; self-trading (taker == maker) is rejected.
- Sandbox: fiat legs are simulated buttons; no real payment rails are integrated.

## API sketch

```
GET    /api/p2p/ads?side=SELL&asset=BTC&fiat=UAH
POST   /api/p2p/ads
PATCH  /api/p2p/ads/:id            (pause/close/edit limits)
POST   /api/p2p/orders             { adId, amount }
POST   /api/p2p/orders/:id/pay     (buyer: mark as paid)
POST   /api/p2p/orders/:id/release (seller: release escrow)
POST   /api/p2p/orders/:id/dispute
GET    /api/p2p/orders/:id/messages | POST message
POST   /api/p2p/disputes/:id/resolve   (moderator only)
```

The `p2p` NestJS module exists as a placeholder from Milestone 1 so routing, permissions and module boundaries are stable.
