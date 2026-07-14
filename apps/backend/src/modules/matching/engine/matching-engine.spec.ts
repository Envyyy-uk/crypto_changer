import { Decimal, computeFee } from '@crypto-exchange/validation';
import { MatchingEngine, SubmitOrderInput } from './matching-engine';
import { OrderBook } from './order-book';

function engine() {
  return new MatchingEngine(new OrderBook('BTCUSDT'));
}

function limit(
  id: string,
  userId: string,
  side: 'BUY' | 'SELL',
  price: string,
  quantity: string,
): SubmitOrderInput {
  return { id, userId, side, type: 'LIMIT', price: new Decimal(price), quantity: new Decimal(quantity) };
}

function market(
  id: string,
  userId: string,
  side: 'BUY' | 'SELL',
  quantity: string,
): SubmitOrderInput {
  return { id, userId, side, type: 'MARKET', quantity: new Decimal(quantity) };
}

describe('MatchingEngine', () => {
  // TASK-024: Buy 60100 vs Sell 60000 must match — at the maker's price.
  it('matches crossing limit orders at the maker price', () => {
    const e = engine();
    e.submit(limit('s1', 'seller', 'SELL', '60000', '0.01'));
    const result = e.submit(limit('b1', 'buyer', 'BUY', '60100', '0.01'));

    expect(result.status).toBe('FILLED');
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0].price.toString()).toBe('60000');
    expect(result.fills[0].quantity.toString()).toBe('0.01');
    expect(e.book.isEmpty()).toBe(true);
  });

  it('does not match when prices do not cross; both rest on the book', () => {
    const e = engine();
    const sell = e.submit(limit('s1', 'seller', 'SELL', '60100', '0.01'));
    const buy = e.submit(limit('b1', 'buyer', 'BUY', '60000', '0.01'));

    expect(sell.status).toBe('RESTING');
    expect(buy.status).toBe('RESTING');
    const snap = e.book.snapshot();
    expect(snap.asks[0].price.toString()).toBe('60100');
    expect(snap.bids[0].price.toString()).toBe('60000');
  });

  // TASK-025: partial execution.
  it('partially fills the larger order and leaves the remainder resting', () => {
    const e = engine();
    e.submit(limit('s1', 'seller', 'SELL', '60000', '0.03'));
    const buy = e.submit(limit('b1', 'buyer', 'BUY', '60000', '0.01'));

    expect(buy.status).toBe('FILLED');
    const snap = e.book.snapshot();
    expect(snap.asks[0].quantity.toString()).toBe('0.02'); // 0.03 − 0.01
  });

  // TASK-026: market order walks levels; average price check.
  it('fills a market order across multiple levels at each maker price', () => {
    const e = engine();
    e.submit(limit('s1', 'mm', 'SELL', '60000', '0.01'));
    e.submit(limit('s2', 'mm', 'SELL', '60100', '0.02'));
    e.submit(limit('s3', 'mm', 'SELL', '60200', '0.05'));

    const result = e.submit(market('b1', 'buyer', 'BUY', '0.03'));

    expect(result.status).toBe('FILLED');
    expect(result.fills).toHaveLength(2);
    expect(result.fills[0].quoteAmount.toString()).toBe('600'); // 0.01 × 60000
    expect(result.fills[1].quoteAmount.toString()).toBe('1202'); // 0.02 × 60100

    const totalQuote = result.fills.reduce((s, f) => s.plus(f.quoteAmount), new Decimal(0));
    expect(totalQuote.toString()).toBe('1802');
    const avgPrice = totalQuote.dividedBy('0.03').toDecimalPlaces(2);
    expect(avgPrice.toString()).toBe('60066.67');

    // Untouched third level remains.
    expect(e.book.snapshot().asks[0].price.toString()).toBe('60200');
  });

  // TASK-027: taker fee on the walked total, rounded to 0.01 USDT.
  it('supports the spec fee example: 1802 × 0.1% → 1.80 USDT', () => {
    expect(computeFee('1802', '0.001', 2).toString()).toBe('1.8');
  });

  it('cancels the unfilled remainder of a market order when liquidity runs out', () => {
    const e = engine();
    e.submit(limit('s1', 'mm', 'SELL', '60000', '0.01'));
    const result = e.submit(market('b1', 'buyer', 'BUY', '0.05'));

    expect(result.status).toBe('PARTIALLY_FILLED_CANCELLED');
    expect(result.remaining.toString()).toBe('0.04');
    expect(e.book.isEmpty()).toBe(true); // market remainder never rests
  });

  it('cancels a market order outright when the book is empty', () => {
    const result = engine().submit(market('b1', 'buyer', 'BUY', '0.01'));
    expect(result.status).toBe('CANCELLED');
    expect(result.fills).toHaveLength(0);
  });

  // Price-time priority.
  it('fills orders at the same price in FIFO order', () => {
    const e = engine();
    e.submit(limit('s1', 'alice', 'SELL', '60000', '0.01'));
    e.submit(limit('s2', 'bob', 'SELL', '60000', '0.01'));
    const result = e.submit(market('b1', 'buyer', 'BUY', '0.01'));

    expect(result.fills[0].makerOrderId).toBe('s1'); // oldest first
  });

  it('prefers the best price over time priority', () => {
    const e = engine();
    e.submit(limit('s1', 'alice', 'SELL', '60100', '0.01')); // earlier but worse
    e.submit(limit('s2', 'bob', 'SELL', '60000', '0.01')); // later but better
    const result = e.submit(market('b1', 'buyer', 'BUY', '0.01'));

    expect(result.fills[0].makerOrderId).toBe('s2');
    expect(result.fills[0].price.toString()).toBe('60000');
  });

  // TASK-028: self-trade prevention (cancel-taker policy).
  it('stops matching when the taker would trade with themselves', () => {
    const e = engine();
    e.submit(limit('s1', 'alice', 'SELL', '60000', '0.01'));
    const result = e.submit(limit('b1', 'alice', 'BUY', '60000', '0.01'));

    expect(result.selfTradePrevented).toBe(true);
    expect(result.status).toBe('CANCELLED');
    expect(result.fills).toHaveLength(0);
    // Alice's resting sell is untouched.
    expect(e.book.snapshot().asks[0].quantity.toString()).toBe('0.01');
  });

  it('fills against others before stopping at own order', () => {
    const e = engine();
    e.submit(limit('s1', 'bob', 'SELL', '60000', '0.01'));
    e.submit(limit('s2', 'alice', 'SELL', '60100', '0.02'));
    const result = e.submit(limit('b1', 'alice', 'BUY', '60200', '0.03'));

    expect(result.fills).toHaveLength(1); // filled bob's 0.01 only
    expect(result.selfTradePrevented).toBe(true);
    expect(result.status).toBe('PARTIALLY_FILLED_CANCELLED');
    expect(result.remaining.toString()).toBe('0.02');
  });

  it('supports cancelling a resting order', () => {
    const e = engine();
    e.submit(limit('s1', 'alice', 'SELL', '60000', '0.01'));
    expect(e.cancel('s1')).toBe(true);
    expect(e.book.isEmpty()).toBe(true);
    expect(e.cancel('s1')).toBe(false); // already gone
  });

  it('keeps exact quantities through many partial fills (no float drift)', () => {
    const e = engine();
    // Ten sells of 0.1 each; a buy of 0.99999999 must leave exactly 0.00000001 on the last level...
    for (let i = 0; i < 10; i++) {
      e.submit(limit(`s${i}`, 'mm', 'SELL', '60000', '0.1'));
    }
    const result = e.submit(market('b1', 'buyer', 'BUY', '0.99999999'));
    expect(result.status).toBe('FILLED');
    expect(e.book.snapshot().asks[0].quantity.toString()).toBe('1e-8');
  });
});
