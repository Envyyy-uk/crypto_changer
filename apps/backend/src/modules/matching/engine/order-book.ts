import { Decimal } from '@crypto-exchange/validation';
import { BookSide, BookSnapshot, EngineOrder, PriceLevel } from './types';

interface Level {
  price: Decimal;
  orders: EngineOrder[]; // FIFO — oldest first
}

/**
 * One order book per market. Bids are kept best-first (highest price),
 * asks best-first (lowest price); orders within a level are FIFO.
 *
 * Plain sorted arrays keep the implementation obvious and easily audited;
 * throughput is far beyond what a local sandbox needs. Swap for a heap or
 * a sorted map only if profiling ever demands it.
 */
export class OrderBook {
  private readonly bids: Level[] = [];
  private readonly asks: Level[] = [];

  constructor(readonly marketSymbol: string) {}

  bestBid(): EngineOrder | undefined {
    return this.bids[0]?.orders[0];
  }

  bestAsk(): EngineOrder | undefined {
    return this.asks[0]?.orders[0];
  }

  /** Adds a limit order to its side. Market orders must never be added. */
  add(order: EngineOrder): void {
    if (order.price === null) {
      throw new Error('Market orders cannot rest on the book');
    }
    const levels = order.side === 'BUY' ? this.bids : this.asks;
    const index = this.findLevelIndex(levels, order.side, order.price);

    if (index < levels.length && levels[index].price.equals(order.price)) {
      levels[index].orders.push(order);
    } else {
      levels.splice(index, 0, { price: order.price, orders: [order] });
    }
  }

  /** Removes an order (e.g. cancellation). Returns true if it was found. */
  remove(orderId: string): boolean {
    for (const levels of [this.bids, this.asks]) {
      for (let i = 0; i < levels.length; i++) {
        const idx = levels[i].orders.findIndex((o) => o.id === orderId);
        if (idx !== -1) {
          levels[i].orders.splice(idx, 1);
          if (levels[i].orders.length === 0) levels.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  }

  /** Removes the current best order of a side after it is fully filled. */
  removeBest(side: BookSide): void {
    const levels = side === 'BUY' ? this.bids : this.asks;
    const level = levels[0];
    if (!level) return;
    level.orders.shift();
    if (level.orders.length === 0) levels.shift();
  }

  /** Aggregated view of the top `depth` levels per side. */
  snapshot(depth = 20): BookSnapshot {
    const aggregate = (levels: Level[]): PriceLevel[] =>
      levels.slice(0, depth).map((level) => ({
        price: level.price,
        quantity: level.orders.reduce((sum, o) => sum.plus(o.remaining), new Decimal(0)),
      }));
    return { bids: aggregate(this.bids), asks: aggregate(this.asks) };
  }

  isEmpty(): boolean {
    return this.bids.length === 0 && this.asks.length === 0;
  }

  /** Binary search for the insertion index that keeps best price first. */
  private findLevelIndex(levels: Level[], side: BookSide, price: Decimal): number {
    let lo = 0;
    let hi = levels.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const cmp = levels[mid].price.comparedTo(price);
      const midComesFirst = side === 'BUY' ? cmp > 0 : cmp < 0;
      if (midComesFirst) lo = mid + 1;
      else if (cmp === 0) return mid;
      else hi = mid;
    }
    return lo;
  }
}
