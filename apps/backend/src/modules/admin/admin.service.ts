import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SYSTEM_ACCOUNTS } from '@crypto-exchange/config';
import { toDecimal } from '@crypto-exchange/validation';
import { LedgerEntryDirection, LedgerTransactionType } from '@prisma/client';
import { InsufficientBalanceError } from '../../common/errors/domain.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { MarketMakerService } from '../market-maker/market-maker.service';
import { CreateBalanceAdjustmentDto } from './dto/create-balance-adjustment.dto';
import { UpdateMarketDto } from './dto/update-market.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

const USER_LIST_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  emailVerified: true,
  twoFactorEnabled: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly assets: AssetsService,
    private readonly audit: AuditService,
    private readonly marketMaker: MarketMakerService,
  ) {}

  listUsers(page = 1, pageSize = 50) {
    const take = Math.min(100, Math.max(1, pageSize));
    const skip = (Math.max(1, page) - 1) * take;
    return this.prisma.user.findMany({
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_LIST_SELECT });
    if (!user) throw new NotFoundException('User not found');

    const [accounts, orders, trades, deposits, withdrawals] = await Promise.all([
      this.prisma.account.findMany({
        where: { userId },
        include: { asset: { select: { symbol: true } } },
      }),
      this.prisma.order.findMany({
        where: { userId },
        include: { market: { select: { symbol: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.trade.findMany({
        where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
        include: { market: { select: { symbol: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.deposit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    return {
      user,
      balances: accounts.map((a) => ({ asset: a.asset.symbol, available: a.available, locked: a.locked })),
      recentOrders: orders,
      recentTrades: trades,
      recentDeposits: deposits,
      recentWithdrawals: withdrawals,
    };
  }

  async updateUserStatus(adminId: string, userId: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: dto.status },
      select: USER_LIST_SELECT,
    });
    await this.audit.record({
      actorId: adminId,
      action: 'USER_STATUS_CHANGED',
      targetType: 'USER',
      targetId: userId,
      metadata: { from: user.status, to: dto.status },
    });
    return updated;
  }

  listMarkets() {
    return this.prisma.market.findMany({
      include: { baseAsset: true, quoteAsset: true },
      orderBy: { symbol: 'asc' },
    });
  }

  async updateMarket(adminId: string, symbol: string, dto: UpdateMarketDto) {
    const market = await this.prisma.market.findUnique({ where: { symbol: symbol.toUpperCase() } });
    if (!market) throw new NotFoundException(`Unknown market: ${symbol}`);

    const updated = await this.prisma.market.update({
      where: { id: market.id },
      data: {
        status: dto.status,
        makerFee: dto.makerFee,
        takerFee: dto.takerFee,
      },
      include: { baseAsset: true, quoteAsset: true },
    });
    await this.audit.record({
      actorId: adminId,
      action: 'MARKET_UPDATED',
      targetType: 'MARKET',
      targetId: market.id,
      metadata: { before: { status: market.status, makerFee: market.makerFee.toString(), takerFee: market.takerFee.toString() }, requested: dto },
    });
    return updated;
  }

  /**
   * The only way an admin can move a balance: never a raw UPDATE, always a
   * balanced ledger transaction against a dedicated ADMIN_ADJUSTMENT system
   * account, with the operator and reason captured in the audit log.
   */
  async createBalanceAdjustment(adminId: string, dto: CreateBalanceAdjustmentDto) {
    const asset = await this.assets.findBySymbolOrThrow(dto.asset.toUpperCase());
    const amount = toDecimal(dto.amount);
    if (amount.isZero()) {
      throw new BadRequestException('Adjustment amount cannot be zero');
    }

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        const account = await this.ledger.getOrCreateUserAccount(tx, dto.userId, asset.id);
        const system = await this.ledger.getOrCreateSystemAccount(tx, SYSTEM_ACCOUNTS.ADMIN_ADJUSTMENT, asset.id);
        const magnitude = amount.abs();

        return this.ledger.postTransaction(tx, {
          type: LedgerTransactionType.ADMIN_ADJUSTMENT,
          referenceType: 'USER',
          referenceId: dto.userId,
          description: dto.reason,
          entries: amount.greaterThan(0)
            ? [
                { accountId: system.id, direction: LedgerEntryDirection.DEBIT, amount: magnitude },
                { accountId: account.id, direction: LedgerEntryDirection.CREDIT, amount: magnitude },
              ]
            : [
                { accountId: account.id, direction: LedgerEntryDirection.DEBIT, amount: magnitude },
                { accountId: system.id, direction: LedgerEntryDirection.CREDIT, amount: magnitude },
              ],
        });
      });

      await this.audit.record({
        actorId: adminId,
        action: 'BALANCE_ADJUSTED',
        targetType: 'USER',
        targetId: dto.userId,
        metadata: { asset: asset.symbol, amount: dto.amount, reason: dto.reason, ledgerTransactionId: transaction.id },
      });
      return transaction;
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  marketMakerStatus() {
    return { running: this.marketMaker.isRunning() };
  }

  async pauseMarketMaker(adminId: string) {
    this.marketMaker.pause();
    await this.audit.record({ actorId: adminId, action: 'MARKET_MAKER_PAUSED' });
    return this.marketMakerStatus();
  }

  async resumeMarketMaker(adminId: string) {
    this.marketMaker.start();
    await this.audit.record({ actorId: adminId, action: 'MARKET_MAKER_RESUMED' });
    return this.marketMakerStatus();
  }

  listAuditLog(params: { page?: number; pageSize?: number; targetType?: string }) {
    return this.audit.list(params);
  }
}
