import { Injectable } from '@nestjs/common';
import { Decimal } from '@crypto-exchange/validation';
import { HoldStatus, Prisma } from '@prisma/client';
import {
  HoldNotFoundError,
  InsufficientBalanceError,
} from '../../common/errors/domain.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class BalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async getBalances(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      include: { asset: true },
      orderBy: { asset: { symbol: 'asc' } },
    });
    return accounts.map((account) => ({
      asset: account.asset.symbol,
      available: account.available,
      locked: account.locked,
    }));
  }

  /**
   * Reserves funds for an order: available → locked plus an ACTIVE hold row.
   * The guarded update makes check-and-move atomic under concurrency.
   */
  async lockFunds(
    tx: Tx,
    params: {
      userId: string;
      assetId: string;
      assetSymbol: string;
      amount: Decimal;
      orderId: string;
    },
  ) {
    const account = await this.ledger.getOrCreateUserAccount(tx, params.userId, params.assetId);
    const amount = params.amount.toString();

    const updated = await tx.account.updateMany({
      where: { id: account.id, available: { gte: amount } },
      data: {
        available: { decrement: amount },
        locked: { increment: amount },
      },
    });
    if (updated.count === 0) {
      throw new InsufficientBalanceError(params.assetSymbol);
    }

    return tx.hold.create({
      data: {
        accountId: account.id,
        orderId: params.orderId,
        amount,
        status: HoldStatus.ACTIVE,
      },
    });
  }

  /**
   * Releases an order's hold: locked → available, hold → RELEASED.
   * Safe against double-release: flipping the hold status is the gate.
   */
  async releaseHold(tx: Tx, orderId: string) {
    const hold = await tx.hold.findUnique({ where: { orderId } });
    if (!hold) {
      throw new HoldNotFoundError(orderId);
    }

    const flipped = await tx.hold.updateMany({
      where: { id: hold.id, status: HoldStatus.ACTIVE },
      data: { status: HoldStatus.RELEASED, releasedAt: new Date() },
    });
    if (flipped.count === 0) {
      // Already released/consumed — nothing to move.
      return hold;
    }

    const amount = hold.amount.toString();
    await tx.account.update({
      where: { id: hold.accountId },
      data: {
        locked: { decrement: amount },
        available: { increment: amount },
      },
    });

    return tx.hold.findUniqueOrThrow({ where: { id: hold.id } });
  }
}
