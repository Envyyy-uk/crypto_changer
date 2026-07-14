import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SYSTEM_ACCOUNTS } from '@crypto-exchange/config';
import { Decimal } from '@crypto-exchange/validation';
import {
  Asset,
  LedgerEntryDirection,
  LedgerTransactionType,
  Market,
  Order,
  OrderStatus,
  OrderType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BalancesService } from '../balances/balances.service';
import { LedgerService } from '../ledger/ledger.service';
import { MatchingEngine } from './engine/matching-engine';
import { OrderBook } from './engine/order-book';
import { BookSide, Fill, SubmitStatus } from './engine/types';

type Tx = Prisma.TransactionClient;
type MarketWithAssets = Market & { baseAsset: Asset; quoteAsset: Asset };

/** Amount reserved for `qty` of an order at its own limit price: quote for BUY (price × qty), base for SELL (qty). */
function reserveAmount(order: { side: string; price: Prisma.Decimal | null }, qty: Decimal): Decimal {
  return order.side === 'BUY' ? new Decimal(order.price!.toString()).times(qty) : qty;
}

/**
 * Bridges the pure, in-memory MatchingEngine (apps/backend/src/modules/matching/engine)
 * to persistence: one long-lived engine per market, rebuilt from resting
 * orders on boot, mutated synchronously on submit, then settled to the
 * database in a single transaction per incoming order.
 *
 * Two-phase design: OrdersService already created the order and locked the
 * taker's funds in its own transaction before calling here. This method's
 * transaction only ever touches funds that were already reserved (taker's
 * own lock, or a resting maker's pre-existing lock) — so it should never hit
 * InsufficientBalanceError in practice. If it did, the order is left OPEN
 * with funds still locked (a safe, resting state), not half-settled.
 */
@Injectable()
export class MatchingService implements OnModuleInit {
  private readonly logger = new Logger(MatchingService.name);
  private readonly engines = new Map<string, MatchingEngine>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: BalancesService,
    private readonly ledger: LedgerService,
  ) {}

  async onModuleInit() {
    const markets = await this.prisma.market.findMany();
    for (const market of markets) {
      this.engines.set(market.symbol, new MatchingEngine(new OrderBook(market.symbol)));
    }

    // FIFO within a price level depends only on insertion order, so rebuilding
    // oldest-first reproduces the exact resting order the book had before restart.
    const restingOrders = await this.prisma.order.findMany({
      where: { status: { in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] }, type: OrderType.LIMIT },
      include: { market: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const order of restingOrders) {
      const engine = this.engines.get(order.market.symbol);
      if (!engine) continue;
      engine.book.add({
        id: order.id,
        userId: order.userId,
        side: order.side as BookSide,
        price: new Decimal(order.price.toString()),
        remaining: new Decimal(order.remainingQuantity.toString()),
        sequence: 0,
      });
    }
    this.logger.log(
      `Matching engines ready for ${markets.length} market(s); ${restingOrders.length} resting order(s) restored`,
    );
  }

  getSnapshot(symbol: string) {
    return this.engines.get(symbol.toUpperCase())?.book.snapshot();
  }

  /** Removes a resting order from its market's in-memory book (mirrors a DB cancel). */
  cancelResting(symbol: string, orderId: string) {
    this.engines.get(symbol.toUpperCase())?.cancel(orderId);
  }

  /**
   * Submits a freshly created, fully-funded order to its market's engine and
   * settles whatever fills result. Returns the order's final DB state.
   */
  async submitAndSettle(newOrder: Order, market: MarketWithAssets): Promise<Order> {
    const engine = this.engines.get(market.symbol);
    if (!engine) {
      throw new Error(`No matching engine initialized for market ${market.symbol}`);
    }

    const result = engine.submit({
      id: newOrder.id,
      userId: newOrder.userId,
      side: newOrder.side as BookSide,
      type: newOrder.type as 'LIMIT' | 'MARKET',
      price: newOrder.price ? new Decimal(newOrder.price.toString()) : undefined,
      quantity: new Decimal(newOrder.quantity.toString()),
    });

    if (result.fills.length === 0 && result.status === 'RESTING') {
      // Engine already added it to the book; the DB row is already correct as-is.
      return newOrder;
    }

    return this.prisma.$transaction(async (tx) => {
      for (const fill of result.fills) {
        await this.settleFill(tx, fill, market);
      }

      if (this.isCancelledRemainder(result.status) && result.remaining.greaterThan(0)) {
        // Market order ran out of liquidity, or STP stopped mid-book: the
        // remainder will never fill, so release what's still reserved for it.
        await this.balances.reduceHold(
          tx,
          newOrder.id,
          reserveAmount({ side: newOrder.side, price: newOrder.price }, result.remaining),
        );
        await tx.order.update({
          where: { id: newOrder.id },
          data: {
            status: OrderStatus.CANCELLED,
            rejectReason: result.selfTradePrevented ? 'SELF_TRADE_PREVENTED' : 'NO_LIQUIDITY',
          },
        });
      }

      return tx.order.findUniqueOrThrow({ where: { id: newOrder.id } });
    });
  }

  private isCancelledRemainder(status: SubmitStatus): boolean {
    return status === 'PARTIALLY_FILLED_CANCELLED' || status === 'CANCELLED';
  }

  private async settleFill(tx: Tx, fill: Fill, market: MarketWithAssets) {
    const makerOrder = await tx.order.findUniqueOrThrow({ where: { id: fill.makerOrderId } });
    const takerOrder = await tx.order.findUniqueOrThrow({ where: { id: fill.takerOrderId } });
    const makerIsBuyer = makerOrder.side === 'BUY';
    const buyerOrder = makerIsBuyer ? makerOrder : takerOrder;
    const sellerOrder = makerIsBuyer ? takerOrder : makerOrder;

    // Un-reserve exactly what each side set aside for this quantity. The
    // buyer's own limit price may exceed the fill price (price improvement);
    // the seller's base-asset reserve is always 1:1 with quantity.
    await this.balances.reduceHold(tx, buyerOrder.id, reserveAmount(buyerOrder, fill.quantity));
    await this.balances.reduceHold(tx, sellerOrder.id, reserveAmount(sellerOrder, fill.quantity));

    const buyerFeeRate = new Decimal((makerIsBuyer ? market.makerFee : market.takerFee).toString());
    const sellerFeeRate = new Decimal((makerIsBuyer ? market.takerFee : market.makerFee).toString());
    // Fee is deducted from what each side receives: base asset for the buyer, quote asset for the seller.
    const buyerFeeBase = fill.quantity.times(buyerFeeRate);
    const sellerFeeQuote = fill.quoteAmount.times(sellerFeeRate);

    const trade = await tx.trade.create({
      data: {
        marketId: market.id,
        makerOrderId: makerOrder.id,
        takerOrderId: takerOrder.id,
        buyerId: buyerOrder.userId,
        sellerId: sellerOrder.userId,
        price: fill.price.toString(),
        quantity: fill.quantity.toString(),
        quoteAmount: fill.quoteAmount.toString(),
        makerFee: (makerIsBuyer ? buyerFeeBase : sellerFeeQuote).toString(),
        takerFee: (makerIsBuyer ? sellerFeeQuote : buyerFeeBase).toString(),
      },
    });

    const [buyerBase, buyerQuote, sellerBase, sellerQuote, feeBase, feeQuote] = await Promise.all([
      this.ledger.getOrCreateUserAccount(tx, buyerOrder.userId, market.baseAssetId),
      this.ledger.getOrCreateUserAccount(tx, buyerOrder.userId, market.quoteAssetId),
      this.ledger.getOrCreateUserAccount(tx, sellerOrder.userId, market.baseAssetId),
      this.ledger.getOrCreateUserAccount(tx, sellerOrder.userId, market.quoteAssetId),
      this.ledger.getOrCreateSystemAccount(tx, SYSTEM_ACCOUNTS.FEE_REVENUE, market.baseAssetId),
      this.ledger.getOrCreateSystemAccount(tx, SYSTEM_ACCOUNTS.FEE_REVENUE, market.quoteAssetId),
    ]);

    const entries: { accountId: string; direction: LedgerEntryDirection; amount: Decimal }[] = [
      { accountId: buyerQuote.id, direction: LedgerEntryDirection.DEBIT, amount: fill.quoteAmount },
      { accountId: sellerBase.id, direction: LedgerEntryDirection.DEBIT, amount: fill.quantity },
    ];
    if (sellerFeeQuote.greaterThan(0)) {
      entries.push({ accountId: sellerQuote.id, direction: LedgerEntryDirection.CREDIT, amount: fill.quoteAmount.minus(sellerFeeQuote) });
      entries.push({ accountId: feeQuote.id, direction: LedgerEntryDirection.CREDIT, amount: sellerFeeQuote });
    } else {
      entries.push({ accountId: sellerQuote.id, direction: LedgerEntryDirection.CREDIT, amount: fill.quoteAmount });
    }
    if (buyerFeeBase.greaterThan(0)) {
      entries.push({ accountId: buyerBase.id, direction: LedgerEntryDirection.CREDIT, amount: fill.quantity.minus(buyerFeeBase) });
      entries.push({ accountId: feeBase.id, direction: LedgerEntryDirection.CREDIT, amount: buyerFeeBase });
    } else {
      entries.push({ accountId: buyerBase.id, direction: LedgerEntryDirection.CREDIT, amount: fill.quantity });
    }

    await this.ledger.postTransaction(tx, {
      type: LedgerTransactionType.TRADE_FILL,
      referenceType: 'TRADE',
      referenceId: trade.id,
      entries,
    });

    await this.applyFillToOrder(tx, makerOrder.id, fill.quantity);
    await this.applyFillToOrder(tx, takerOrder.id, fill.quantity);
  }

  private async applyFillToOrder(tx: Tx, orderId: string, quantity: Decimal) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const filled = new Decimal(order.filledQuantity.toString()).plus(quantity);
    const remaining = new Decimal(order.remainingQuantity.toString()).minus(quantity);
    await tx.order.update({
      where: { id: orderId },
      data: {
        filledQuantity: filled.toString(),
        remainingQuantity: remaining.toString(),
        status: remaining.lessThanOrEqualTo(0) ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED,
      },
    });
  }
}
