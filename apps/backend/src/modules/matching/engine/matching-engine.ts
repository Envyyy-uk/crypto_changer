import { Decimal } from '@crypto-exchange/validation';
import { OrderBook } from './order-book';
import { BookSide, EngineOrder, Fill, SubmitResult, SubmitStatus } from './types';

export interface SubmitOrderInput {
  id: string;
  userId: string;
  side: BookSide;
  type: 'LIMIT' | 'MARKET';
  /** Required for LIMIT, ignored for MARKET. */
  price?: Decimal;
  quantity: Decimal;
}

/**
 * Price-time priority matching for one market.
 *
 * Rules:
 * - A trade executes at the MAKER's (resting) price.
 * - Limit taker matches while it crosses (BUY: price ≥ best ask; SELL: price ≤ best bid),
 *   then any remainder rests on the book.
 * - Market taker walks levels until filled or liquidity runs out; the
 *   remainder is cancelled (market orders never rest).
 * - Self-trade prevention: matching stops the moment the taker would hit
 *   their own order; the taker's remainder is cancelled (cancel-taker policy),
 *   the resting order stays untouched.
 *
 * The engine is pure and synchronous: persistence, holds and ledger postings
 * are applied by the caller from the returned fills, inside one DB transaction.
 */
export class MatchingEngine {
  private sequence = 0;

  constructor(readonly book: OrderBook) {}

  submit(input: SubmitOrderInput): SubmitResult {
    if (input.type === 'LIMIT' && !input.price) {
      throw new Error('LIMIT order requires a price');
    }
    if (input.quantity.lessThanOrEqualTo(0)) {
      throw new Error('Quantity must be positive');
    }

    const taker: EngineOrder = {
      id: input.id,
      userId: input.userId,
      side: input.side,
      price: input.type === 'LIMIT' ? input.price! : null,
      remaining: input.quantity,
      sequence: ++this.sequence,
    };

    const fills: Fill[] = [];
    let selfTradePrevented = false;

    while (taker.remaining.greaterThan(0)) {
      const maker = input.side === 'BUY' ? this.book.bestAsk() : this.book.bestBid();
      if (!maker) break;
      if (taker.price !== null && !crosses(taker.side, taker.price, maker.price!)) break;

      if (maker.userId === taker.userId) {
        selfTradePrevented = true;
        break;
      }

      const quantity = Decimal.min(maker.remaining, taker.remaining);
      const price = maker.price!;
      fills.push({
        makerOrderId: maker.id,
        takerOrderId: taker.id,
        makerUserId: maker.userId,
        takerUserId: taker.userId,
        price,
        quantity,
        quoteAmount: price.times(quantity),
      });

      maker.remaining = maker.remaining.minus(quantity);
      taker.remaining = taker.remaining.minus(quantity);
      if (maker.remaining.isZero()) {
        this.book.removeBest(maker.side);
      }
    }

    return {
      orderId: taker.id,
      status: this.finalize(taker, input.type, fills.length > 0, selfTradePrevented),
      fills,
      remaining: taker.remaining,
      selfTradePrevented,
    };
  }

  cancel(orderId: string): boolean {
    return this.book.remove(orderId);
  }

  private finalize(
    taker: EngineOrder,
    type: 'LIMIT' | 'MARKET',
    hasFills: boolean,
    stp: boolean,
  ): SubmitStatus {
    if (taker.remaining.isZero()) return 'FILLED';

    if (type === 'LIMIT' && !stp) {
      this.book.add(taker);
      return hasFills ? 'PARTIALLY_FILLED_RESTING' : 'RESTING';
    }

    // Market remainder, or STP-stopped limit remainder: cancelled.
    return hasFills ? 'PARTIALLY_FILLED_CANCELLED' : 'CANCELLED';
  }
}

function crosses(takerSide: BookSide, takerPrice: Decimal, makerPrice: Decimal): boolean {
  return takerSide === 'BUY'
    ? takerPrice.greaterThanOrEqualTo(makerPrice)
    : takerPrice.lessThanOrEqualTo(makerPrice);
}
