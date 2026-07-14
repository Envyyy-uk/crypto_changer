export interface Ticker {
  symbol: string;
  lastPrice: string;
  priceChangePercent24h: string;
  high24h: string;
  low24h: string;
  baseVolume24h: string;
  quoteVolume24h: string;
  updatedAt: string; // ISO timestamp of the last upstream update
  stale: boolean; // true when no update arrived within the staleness window
}

/** Payload shape of Binance's combined-stream `<symbol>@ticker` events. */
export interface BinanceTickerEvent {
  stream: string;
  data: {
    e: string; // event type, "24hrTicker"
    s: string; // symbol, e.g. "BTCUSDT"
    c: string; // last price
    P: string; // price change percent
    h: string; // 24h high
    l: string; // 24h low
    v: string; // 24h base volume
    q: string; // 24h quote volume
  };
}

export function parseTickerEvent(raw: unknown): Omit<Ticker, 'updatedAt' | 'stale'> | null {
  const event = raw as Partial<BinanceTickerEvent>;
  const d = event?.data;
  if (!d || d.e !== '24hrTicker' || typeof d.s !== 'string') return null;
  if ([d.c, d.P, d.h, d.l, d.v, d.q].some((f) => typeof f !== 'string')) return null;
  return {
    symbol: d.s,
    lastPrice: d.c!,
    priceChangePercent24h: d.P!,
    high24h: d.h!,
    low24h: d.l!,
    baseVolume24h: d.v!,
    quoteVolume24h: d.q!,
  };
}
