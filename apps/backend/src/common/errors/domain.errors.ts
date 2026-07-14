/** Base class for domain errors mapped to HTTP responses by the exception filter. */
export abstract class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class LedgerImbalanceError extends DomainError {
  constructor(debits: string, credits: string) {
    super(`Unbalanced ledger transaction: debits=${debits} credits=${credits}`, 'LEDGER_IMBALANCE');
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(asset: string) {
    super(`Insufficient available balance for ${asset}`, 'INSUFFICIENT_BALANCE');
  }
}

export class InvalidLedgerEntryError extends DomainError {
  constructor(reason: string) {
    super(`Invalid ledger entry: ${reason}`, 'INVALID_LEDGER_ENTRY');
  }
}

export class HoldNotFoundError extends DomainError {
  constructor(orderId: string) {
    super(`No active hold found for order ${orderId}`, 'HOLD_NOT_FOUND');
  }
}
