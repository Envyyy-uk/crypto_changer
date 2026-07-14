export interface Ticker {
  symbol: string;
  lastPrice: string;
  priceChangePercent24h: string;
  high24h: string;
  low24h: string;
  baseVolume24h: string;
  quoteVolume24h: string;
  updatedAt: string;
  stale: boolean;
}

export interface Market {
  id: string;
  symbol: string;
  tickSize: string;
  quantityStep: string;
  minimumQuantity: string;
  minimumNotional: string;
  makerFee: string;
  takerFee: string;
  status: string;
  baseAsset: { symbol: string; name: string };
  quoteAsset: { symbol: string; name: string };
}

export interface Balance {
  asset: string;
  available: string;
  locked: string;
}

export interface Order {
  id: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  price: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  status: string;
  createdAt: string;
  market?: { symbol: string };
}

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}
