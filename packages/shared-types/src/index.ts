// Enums mirrored from the Prisma schema. Kept in a shared package so the
// frontend and admin apps can consume them without depending on Prisma.

export enum UserRole {
  USER = 'USER',
  SUPPORT = 'SUPPORT',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BLOCKED = 'BLOCKED',
}

export enum MarketStatus {
  ACTIVE = 'ACTIVE',
  HALTED = 'HALTED',
  CANCEL_ONLY = 'CANCEL_ONLY',
  DISABLED = 'DISABLED',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatus {
  NEW = 'NEW',
  OPEN = 'OPEN',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

// ---- Public API shapes (all decimals travel as strings) ----

export interface UserPublic {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AssetPublic {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  tradingEnabled: boolean;
}

export interface MarketPublic {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: string;
  quantityStep: string;
  minimumQuantity: string;
  minimumNotional: string;
  makerFee: string;
  takerFee: string;
  status: MarketStatus;
}

export interface BalancePublic {
  asset: string;
  available: string;
  locked: string;
}

export interface OrderPublic {
  id: string;
  market: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}
