import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SYSTEM_ACCOUNTS } from '@crypto-exchange/config';
import { isPositive, toDecimal } from '@crypto-exchange/validation';
import {
  DepositStatus,
  LedgerEntryDirection,
  LedgerTransactionType,
  WithdrawalStatus,
} from '@prisma/client';
import { InsufficientBalanceError } from '../../common/errors/domain.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { AuthService } from '../auth/auth.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';

// Simulated network/processing latency — long enough to see the PENDING
// state in the UI, short enough not to make manual testing tedious.
const DEPOSIT_CONFIRM_DELAY_MS = 2000;
const WITHDRAWAL_STEP_DELAY_MS = 1500;

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly assets: AssetsService,
    private readonly auth: AuthService,
  ) {}

  async createDeposit(userId: string, dto: CreateDepositDto) {
    const asset = await this.assets.findBySymbolOrThrow(dto.asset.toUpperCase());
    if (!asset.depositEnabled) {
      throw new BadRequestException(`Deposits are disabled for ${asset.symbol}`);
    }
    if (!isPositive(dto.amount)) {
      throw new BadRequestException('Amount must be positive');
    }

    const deposit = await this.prisma.deposit.create({
      data: { userId, assetId: asset.id, amount: dto.amount, status: DepositStatus.PENDING },
    });

    // Simulates on-chain confirmation latency; the sandbox always succeeds.
    setTimeout(() => this.confirmDeposit(deposit.id).catch((e) => this.logger.error(e)), DEPOSIT_CONFIRM_DELAY_MS);

    return deposit;
  }

  private async confirmDeposit(depositId: string) {
    await this.prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: depositId } });
      if (deposit.status !== DepositStatus.PENDING) return; // already processed

      const system = await this.ledger.getOrCreateSystemAccount(tx, SYSTEM_ACCOUNTS.TEST_LIQUIDITY, deposit.assetId);
      const account = await this.ledger.getOrCreateUserAccount(tx, deposit.userId, deposit.assetId);
      await this.ledger.postTransaction(tx, {
        type: LedgerTransactionType.DEPOSIT,
        referenceType: 'DEPOSIT',
        referenceId: deposit.id,
        entries: [
          { accountId: system.id, direction: LedgerEntryDirection.DEBIT, amount: toDecimal(deposit.amount.toString()) },
          { accountId: account.id, direction: LedgerEntryDirection.CREDIT, amount: toDecimal(deposit.amount.toString()) },
        ],
      });
      await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: DepositStatus.CONFIRMED, confirmedAt: new Date() },
      });
    });
  }

  listDeposits(userId: string) {
    return this.prisma.deposit.findMany({
      where: { userId },
      include: { asset: { select: { symbol: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Withdrawals debit the user's available balance immediately (into a
   * WITHDRAWAL_SUSPENSE system account) rather than using an order-style
   * Hold, since Hold rows are tied 1:1 to an Order. The status timeline
   * (PENDING → APPROVED → PROCESSING → COMPLETED) then auto-advances on a
   * timer — there is no admin approval step yet (Milestone 4.2).
   */
  async createWithdrawal(userId: string, dto: CreateWithdrawalDto) {
    const asset = await this.assets.findBySymbolOrThrow(dto.asset.toUpperCase());
    if (!asset.withdrawalEnabled) {
      throw new BadRequestException(`Withdrawals are disabled for ${asset.symbol}`);
    }
    if (!isPositive(dto.amount)) {
      throw new BadRequestException('Amount must be positive');
    }
    if (!(await this.auth.verifyCodeForUser(userId, dto.twoFactorCode ?? ''))) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    let withdrawal;
    try {
      withdrawal = await this.prisma.$transaction(async (tx) => {
        const account = await this.ledger.getOrCreateUserAccount(tx, userId, asset.id);
        const suspense = await this.ledger.getOrCreateSystemAccount(
          tx,
          SYSTEM_ACCOUNTS.WITHDRAWAL_SUSPENSE,
          asset.id,
        );
        const amount = toDecimal(dto.amount);

        await this.ledger.postTransaction(tx, {
          type: LedgerTransactionType.WITHDRAWAL,
          referenceType: 'WITHDRAWAL',
          referenceId: userId,
          entries: [
            { accountId: account.id, direction: LedgerEntryDirection.DEBIT, amount },
            { accountId: suspense.id, direction: LedgerEntryDirection.CREDIT, amount },
          ],
        });

        return tx.withdrawal.create({
          data: {
            userId,
            assetId: asset.id,
            amount: dto.amount,
            address: dto.address,
            status: WithdrawalStatus.PENDING,
          },
        });
      });
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    this.scheduleWithdrawalProgress(withdrawal.id);
    return withdrawal;
  }

  private scheduleWithdrawalProgress(withdrawalId: string) {
    this.runWithdrawalProgress(withdrawalId).catch((e) => this.logger.error(e));
  }

  private async runWithdrawalProgress(withdrawalId: string) {
    await delay(WITHDRAWAL_STEP_DELAY_MS);
    await this.prisma.withdrawal.update({ where: { id: withdrawalId }, data: { status: WithdrawalStatus.APPROVED } });

    await delay(WITHDRAWAL_STEP_DELAY_MS);
    await this.prisma.withdrawal.update({ where: { id: withdrawalId }, data: { status: WithdrawalStatus.PROCESSING } });

    await delay(WITHDRAWAL_STEP_DELAY_MS);
    await this.prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: WithdrawalStatus.COMPLETED, processedAt: new Date() },
    });
  }

  listWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      include: { asset: { select: { symbol: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
