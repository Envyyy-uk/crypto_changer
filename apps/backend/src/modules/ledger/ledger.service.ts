import { Injectable } from '@nestjs/common';
import { SYSTEM_ACCOUNTS } from '@crypto-exchange/config';
import { Decimal, toDecimal } from '@crypto-exchange/validation';
import {
  AccountType,
  LedgerEntryDirection,
  LedgerTransactionType,
  Prisma,
} from '@prisma/client';
import {
  InsufficientBalanceError,
  InvalidLedgerEntryError,
  LedgerImbalanceError,
} from '../../common/errors/domain.errors';

type Tx = Prisma.TransactionClient;

export interface LedgerEntryInput {
  accountId: string;
  direction: LedgerEntryDirection;
  amount: Decimal;
}

export interface PostTransactionInput {
  type: LedgerTransactionType;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  entries: LedgerEntryInput[];
}

/**
 * Double-entry ledger. The ONLY component allowed to move value between
 * accounts. Every posted transaction must balance: Σ debits === Σ credits.
 *
 * All methods require an open Prisma transaction so callers can compose
 * ledger postings atomically with their own writes.
 */
@Injectable()
export class LedgerService {
  async getOrCreateUserAccount(tx: Tx, userId: string, assetId: string) {
    const existing = await tx.account.findUnique({
      where: { userId_assetId: { userId, assetId } },
    });
    if (existing) return existing;
    return tx.account.create({
      data: { type: AccountType.USER, userId, assetId },
    });
  }

  async getOrCreateSystemAccount(tx: Tx, systemCode: string, assetId: string) {
    const existing = await tx.account.findUnique({
      where: { systemCode_assetId: { systemCode, assetId } },
    });
    if (existing) return existing;
    return tx.account.create({
      data: { type: AccountType.SYSTEM, systemCode, assetId },
    });
  }

  async postTransaction(tx: Tx, input: PostTransactionInput) {
    if (input.entries.length < 2) {
      throw new InvalidLedgerEntryError('a transaction requires at least two entries');
    }

    let debits = toDecimal(0);
    let credits = toDecimal(0);
    for (const entry of input.entries) {
      if (!entry.amount.isFinite() || entry.amount.lessThanOrEqualTo(0)) {
        throw new InvalidLedgerEntryError('entry amounts must be positive');
      }
      if (entry.direction === LedgerEntryDirection.DEBIT) {
        debits = debits.plus(entry.amount);
      } else {
        credits = credits.plus(entry.amount);
      }
    }
    if (!debits.equals(credits)) {
      throw new LedgerImbalanceError(debits.toString(), credits.toString());
    }

    const transaction = await tx.ledgerTransaction.create({
      data: {
        type: input.type,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: input.description,
      },
    });

    for (const entry of input.entries) {
      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: entry.accountId,
          direction: entry.direction,
          amount: entry.amount.toString(),
        },
      });
      await this.applyToBalance(tx, entry);
    }

    return transaction;
  }

  /**
   * Grants sandbox USDT to a user: DEBIT the TEST_LIQUIDITY issuance account,
   * CREDIT the user's USDT account. The system account is allowed to go
   * negative — its balance is the contra of all issued test funds.
   */
  async grantTestLiquidity(tx: Tx, userId: string, usdtAssetId: string, amount: Decimal) {
    const systemAccount = await this.getOrCreateSystemAccount(
      tx,
      SYSTEM_ACCOUNTS.TEST_LIQUIDITY,
      usdtAssetId,
    );
    const userAccount = await this.getOrCreateUserAccount(tx, userId, usdtAssetId);

    return this.postTransaction(tx, {
      type: LedgerTransactionType.TEST_LIQUIDITY_GRANT,
      referenceType: 'USER',
      referenceId: userId,
      description: 'Sandbox welcome grant',
      entries: [
        { accountId: systemAccount.id, direction: LedgerEntryDirection.DEBIT, amount },
        { accountId: userAccount.id, direction: LedgerEntryDirection.CREDIT, amount },
      ],
    });
  }

  private async applyToBalance(tx: Tx, entry: LedgerEntryInput) {
    const amount = entry.amount.toString();

    if (entry.direction === LedgerEntryDirection.CREDIT) {
      await tx.account.update({
        where: { id: entry.accountId },
        data: { available: { increment: amount } },
      });
      return;
    }

    // DEBIT: user accounts must never go negative — the guarded update makes
    // the check-and-decrement atomic. System accounts may go negative.
    const account = await tx.account.findUniqueOrThrow({
      where: { id: entry.accountId },
      include: { asset: true },
    });

    if (account.type === AccountType.SYSTEM) {
      await tx.account.update({
        where: { id: entry.accountId },
        data: { available: { decrement: amount } },
      });
      return;
    }

    const updated = await tx.account.updateMany({
      where: { id: entry.accountId, available: { gte: amount } },
      data: { available: { decrement: amount } },
    });
    if (updated.count === 0) {
      throw new InsufficientBalanceError(account.asset.symbol);
    }
  }
}
