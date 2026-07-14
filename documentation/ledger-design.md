# Ledger Design

The exchange uses a **double-entry ledger**: money is never created, destroyed or edited in place — it only moves between accounts, and every movement balances to zero.

## Tables

### `accounts`
One row per (owner, asset). Two owner kinds:
- `USER` accounts — `user_id` set, one per user per asset, created lazily.
- `SYSTEM` accounts — `system_code` set (e.g. `TEST_LIQUIDITY`, later `FEE_REVENUE`, `P2P_ESCROW`), no user.

Columns: `available`, `locked` — both `NUMERIC(36,18)`, both `>= 0` for USER accounts. SYSTEM accounts may go negative: `TEST_LIQUIDITY` is an issuance account, its negative balance equals the total test funds in circulation (a standard contra-account).

### `ledger_transactions`
One row per atomic financial event. `type` (`TEST_LIQUIDITY_GRANT`, later `TRADE_FILL`, `FEE`, `DEPOSIT`, `WITHDRAWAL`, `P2P_ESCROW`, `ADMIN_ADJUSTMENT`), optional `reference_type`/`reference_id` (e.g. `ORDER`/uuid) for traceability.

### `ledger_entries`
The legs of a transaction. Each row: `account_id`, `direction` (`DEBIT`|`CREDIT`), `amount > 0`.

**Invariant (enforced in `LedgerService.postTransaction`, inside the same DB transaction):**

```
Σ amount(DEBIT legs) === Σ amount(CREDIT legs)
```

A transaction that does not balance throws `LedgerImbalanceError` and nothing is written.

### `holds`
Funds reserved for an open order (`available → locked` within one account). This is a *reservation*, not a transfer between parties, so it is modeled separately from double-entry. One `ACTIVE` hold per order; statuses `ACTIVE → RELEASED` (cancel) or `ACTIVE → CONSUMED` (fill, Milestone 2).

## Example: registration grant of 100 000 test USDT

| Account | Direction | Amount |
|---|---|---|
| SYSTEM `TEST_LIQUIDITY` (USDT) | DEBIT | 100 000 |
| USER alice (USDT) | CREDIT | 100 000 |

Result: alice `available = 100000`, system account `available = -100000`. Sum across the system: 0.

## Example: placing a Limit Buy 0.01 BTC @ 60 000

- Required quote: `0.01 × 60000 = 600 USDT`
- Guarded update on alice's USDT account: `available -= 600`, `locked += 600` **iff** `available >= 600`
- `holds` row: `{order_id, amount: 600, status: ACTIVE}`

On cancel: reverse the movement, hold → `RELEASED`. On fill (M2): hold is consumed and a balanced `TRADE_FILL` ledger transaction moves value between buyer, seller and the `FEE_REVENUE` account.

## Concurrency

- All mutations use atomic `UPDATE ... SET x = x ± v WHERE <guard>` (Prisma `increment`/`decrement` + conditional `updateMany`), never read-modify-write in JS.
- A guarded update matching 0 rows means insufficient funds ⇒ the whole transaction rolls back.
- Multi-step flows (create user + grant funds; create order + lock funds) run in a single `prisma.$transaction`.

## System-wide invariants (checked by tests, later by a scheduled job)

1. `available >= 0` and `locked >= 0` for every USER account.
2. For every transaction: `Σ debits = Σ credits`.
3. For every asset: `Σ all account balances (incl. SYSTEM) = 0`.
4. For every USER account: `locked = Σ amounts of ACTIVE holds`.
