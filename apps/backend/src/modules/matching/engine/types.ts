import { Decimal } from '@crypto-exchange/validation';

export type BookSide = 'BUY' | 'SELL';

/** A resting or incoming order as the engine sees it — no persistence concerns. */
export interface EngineOrder {
  id: string;
  userId: string;
  side: BookSide;
  /** null → market order (never rests on the book). */
  price: Decimal | null;
  remaining: Decimal;
  /** FIFO tie-break within a price level; assigned by the engine. */
  sequence: number;
}

export interface Fill {
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  /** Execution always happens at the maker's (resting) price. */
  price: Decimal;
  quantity: Decimal;
  /** price × quantity in quote currency. */
  quoteAmount: Decimal;
}

export type SubmitStatus =
  | 'FILLED'
  | 'PARTIALLY_FILLED_RESTING' // limit: partially filled, remainder rests on book
  | 'RESTING' // limit: no fills, rests on book
  | 'PARTIALLY_FILLED_CANCELLED' // market: liquidity ran out / STP stopped matching
  | 'CANCELLED'; // market with no liquidity at all / STP with no fills

export interface SubmitResult {
  orderId: string;
  status: SubmitStatus;
  fills: Fill[];
  /** Unfilled quantity after matching (resting or cancelled, per status). */
  remaining: Decimal;
  /** True when matching stopped because the taker met their own order. */
  selfTradePrevented: boolean;
}

export interface PriceLevel {
  price: Decimal;
  quantity: Decimal;
}

export interface BookSnapshot {
  bids: PriceLevel[];
  asks: PriceLevel[];
}
