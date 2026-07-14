import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  computeNotional,
  Decimal,
  isMultipleOf,
  isPositive,
  toDecimal,
} from '@crypto-exchange/validation';
import { MarketStatus, OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { InsufficientBalanceError } from '../../common/errors/domain.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { MatchingService } from '../matching/matching.service';
import { MarketsService } from '../markets/markets.service';
import { CreateOrderDto } from './dto/create-order.dto';

const OPEN_STATUSES: OrderStatus[] = [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED];

// Market orders have no limit price, so the amount to reserve for the quote
// side is unknown up front. We cap it at the best opposing price plus this
// buffer, to absorb walking a few levels of the book before settling; any
// unused reserve is refunded automatically once the real fill prices are known
// (see MatchingService — the same price-improvement mechanism limit orders use).
const MARKET_ORDER_SLIPPAGE_BUFFER = new Decimal('1.10');

type MarketWithAssets = Awaited<ReturnType<MarketsService['findBySymbolOrThrow']>>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markets: MarketsService,
    private readonly balances: BalancesService,
    private readonly matching: MatchingService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const market = await this.markets.findBySymbolOrThrow(dto.symbol.toUpperCase());

    if (market.status !== MarketStatus.ACTIVE) {
      throw new BadRequestException(`Market ${market.symbol} is not accepting orders`);
    }
    if (!isPositive(dto.quantity)) {
      throw new BadRequestException('Quantity must be positive');
    }
    const quantity = toDecimal(dto.quantity);
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

    const price =
      dto.type === OrderType.LIMIT
        ? this.resolveLimitPrice(dto, market)
        : this.resolveMarketReservePrice(dto, market);

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

    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
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
          orderId: created.id,
        });

        return created;
      });
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.matching.submitAndSettle(order, market);
  }

  /** LIMIT: the user's own price, validated against the market's tick size. */
  private resolveLimitPrice(dto: CreateOrderDto, market: MarketWithAssets): Decimal {
    if (!dto.price) {
      throw new BadRequestException('LIMIT orders require a price');
    }
    if (!isPositive(dto.price)) {
      throw new BadRequestException('Price must be positive');
    }
    const price = toDecimal(dto.price);
    if (!isMultipleOf(price, market.tickSize.toString())) {
      throw new BadRequestException(
        `Price must be a multiple of tick size ${market.tickSize.toString()}`,
      );
    }
    return price;
  }

  /**
   * MARKET: no user-supplied price. BUY reserves against the best ask plus a
   * slippage buffer (refunded automatically as real fills settle); SELL's
   * reserve is price-independent, so the reference price only fills the
   * mandatory `price` column for audit purposes. Either side requires the
   * opposing book to have depth — an empty book means there is nothing to
   * reference or match against.
   */
  private resolveMarketReservePrice(dto: CreateOrderDto, market: MarketWithAssets): Decimal {
    const book = this.matching.getSnapshot(market.symbol);
    const bestOpposing = dto.side === OrderSide.BUY ? book?.asks[0] : book?.bids[0];
    if (!bestOpposing) {
      throw new BadRequestException('No liquidity available for a market order right now');
    }
    return dto.side === OrderSide.BUY
      ? bestOpposing.price.times(MARKET_ORDER_SLIPPAGE_BUFFER)
      : bestOpposing.price;
  }

  async cancelOrder(userId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { market: true } });
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

      // Releases only what is still held; any filled portion already
      // consumed its share of the hold via MatchingService.
      await this.balances.releaseHold(tx, order.id);
      this.matching.cancelResting(order.market.symbol, order.id);

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
