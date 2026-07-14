import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  computeNotional,
  isMultipleOf,
  isPositive,
  toDecimal,
} from '@crypto-exchange/validation';
import { MarketStatus, OrderSide, OrderStatus, OrderType, Prisma } from '@prisma/client';
import { InsufficientBalanceError } from '../../common/errors/domain.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { MarketsService } from '../markets/markets.service';
import { CreateOrderDto } from './dto/create-order.dto';

const OPEN_STATUSES: OrderStatus[] = [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markets: MarketsService,
    private readonly balances: BalancesService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const market = await this.markets.findBySymbolOrThrow(dto.symbol.toUpperCase());

    if (market.status !== MarketStatus.ACTIVE) {
      throw new BadRequestException(`Market ${market.symbol} is not accepting orders`);
    }
    if (dto.type !== OrderType.LIMIT) {
      throw new BadRequestException(
        'Only LIMIT orders are supported until the matching engine ships (Milestone 2)',
      );
    }
    if (!dto.price) {
      throw new BadRequestException('LIMIT orders require a price');
    }
    if (!isPositive(dto.price) || !isPositive(dto.quantity)) {
      throw new BadRequestException('Price and quantity must be positive');
    }

    const price = toDecimal(dto.price);
    const quantity = toDecimal(dto.quantity);

    if (!isMultipleOf(price, market.tickSize.toString())) {
      throw new BadRequestException(
        `Price must be a multiple of tick size ${market.tickSize.toString()}`,
      );
    }
    if (!isMultipleOf(quantity, market.quantityStep.toString())) {
      throw new BadRequestException(
        `Quantity must be a multiple of quantity step ${market.quantityStep.toString()}`,
      );
    }
    if (quantity.lessThan(market.minimumQuantity.toString())) {
      throw new BadRequestException(
        `Quantity is below the minimum ${market.minimumQuantity.toString()}`,
      );
    }

    const notional = computeNotional(price, quantity);
    if (notional.lessThan(market.minimumNotional.toString())) {
      throw new BadRequestException(
        `Order notional ${notional.toString()} is below the minimum ${market.minimumNotional.toString()}`,
      );
    }

    // BUY locks quote currency for the full notional; SELL locks the base quantity.
    const lock =
      dto.side === OrderSide.BUY
        ? { assetId: market.quoteAssetId, assetSymbol: market.quoteAsset.symbol, amount: notional }
        : { assetId: market.baseAssetId, assetSymbol: market.baseAsset.symbol, amount: quantity };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            userId,
            marketId: market.id,
            side: dto.side,
            type: dto.type,
            price: price.toString(),
            quantity: quantity.toString(),
            remainingQuantity: quantity.toString(),
            status: OrderStatus.OPEN,
          },
        });

        await this.balances.lockFunds(tx, {
          userId,
          assetId: lock.assetId,
          assetSymbol: lock.assetSymbol,
          amount: lock.amount,
          orderId: order.id,
        });

        return order;
      });
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async cancelOrder(userId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.userId !== userId) {
        throw new NotFoundException('Order not found');
      }
      if (!OPEN_STATUSES.includes(order.status)) {
        throw new ConflictException(`Order is ${order.status} and cannot be cancelled`);
      }

      const cancelled = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
      });

      // Releases only what is still held; the filled portion (Milestone 2)
      // will have consumed part of the hold already.
      await this.balances.releaseHold(tx, order.id);

      return cancelled;
    });
  }

  listOpen(userId: string) {
    return this.prisma.order.findMany({
      where: { userId, status: { in: OPEN_STATUSES } },
      include: { market: { select: { symbol: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  listHistory(userId: string, params: { market?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    return this.prisma.order.findMany({
      where: {
        userId,
        ...(params.market ? { market: { symbol: params.market.toUpperCase() } } : {}),
      },
      include: { market: { select: { symbol: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async getById(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { market: { select: { symbol: true } } },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
}
