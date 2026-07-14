import { toDecimal } from '@crypto-exchange/validation';
import { LedgerEntryDirection, LedgerTransactionType } from '@prisma/client';
import {
  InvalidLedgerEntryError,
  LedgerImbalanceError,
} from '../../common/errors/domain.errors';
import { LedgerService } from './ledger.service';

function mockTx() {
  return {
    ledgerTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
    ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
    account: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'acc-1',
        type: 'USER',
        asset: { symbol: 'USDT' },
      }),
      create: jest.fn(),
    },
  } as any;
}

describe('LedgerService', () => {
  let service: LedgerService;

  beforeEach(() => {
    service = new LedgerService();
  });

  it('rejects a transaction with fewer than two entries', async () => {
    await expect(
      service.postTransaction(mockTx(), {
        type: LedgerTransactionType.TEST_LIQUIDITY_GRANT,
        entries: [
          { accountId: 'a', direction: LedgerEntryDirection.DEBIT, amount: toDecimal(100) },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidLedgerEntryError);
  });

  it('rejects non-positive entry amounts', async () => {
    await expect(
      service.postTransaction(mockTx(), {
        type: LedgerTransactionType.TEST_LIQUIDITY_GRANT,
        entries: [
          { accountId: 'a', direction: LedgerEntryDirection.DEBIT, amount: toDecimal(0) },
          { accountId: 'b', direction: LedgerEntryDirection.CREDIT, amount: toDecimal(0) },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidLedgerEntryError);
  });

  it('rejects an unbalanced transaction (debits != credits)', async () => {
    const tx = mockTx();
    await expect(
      service.postTransaction(tx, {
        type: LedgerTransactionType.TEST_LIQUIDITY_GRANT,
        entries: [
          { accountId: 'a', direction: LedgerEntryDirection.DEBIT, amount: toDecimal('100') },
          { accountId: 'b', direction: LedgerEntryDirection.CREDIT, amount: toDecimal('99.99') },
        ],
      }),
    ).rejects.toBeInstanceOf(LedgerImbalanceError);
    expect(tx.ledgerTransaction.create).not.toHaveBeenCalled();
  });

  it('posts a balanced transaction and writes every leg', async () => {
    const tx = mockTx();
    await service.postTransaction(tx, {
      type: LedgerTransactionType.TEST_LIQUIDITY_GRANT,
      entries: [
        { accountId: 'sys', direction: LedgerEntryDirection.DEBIT, amount: toDecimal('100000') },
        { accountId: 'usr', direction: LedgerEntryDirection.CREDIT, amount: toDecimal('100000') },
      ],
    });
    expect(tx.ledgerTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(2);
  });

  it('balances exactly with decimal amounts that break under floats', async () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; must balance here.
    const tx = mockTx();
    await expect(
      service.postTransaction(tx, {
        type: LedgerTransactionType.TEST_LIQUIDITY_GRANT,
        entries: [
          { accountId: 'a', direction: LedgerEntryDirection.DEBIT, amount: toDecimal('0.1') },
          { accountId: 'b', direction: LedgerEntryDirection.DEBIT, amount: toDecimal('0.2') },
          { accountId: 'c', direction: LedgerEntryDirection.CREDIT, amount: toDecimal('0.3') },
        ],
      }),
    ).resolves.toBeDefined();
  });
});
