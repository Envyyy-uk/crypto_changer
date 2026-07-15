/** Storage precision for all monetary values: NUMERIC(36, 18) in PostgreSQL. */
export const DECIMAL_PRECISION = 36;
export const DECIMAL_SCALE = 18;

/** Default virtual USDT granted to every new user in the sandbox. */
export const DEFAULT_TEST_LIQUIDITY_USDT = '100000';

/** System ledger account codes. */
export const SYSTEM_ACCOUNTS = {
  TEST_LIQUIDITY: 'TEST_LIQUIDITY',
  FEE_REVENUE: 'FEE_REVENUE',
  P2P_ESCROW: 'P2P_ESCROW',
  WITHDRAWAL_SUSPENSE: 'WITHDRAWAL_SUSPENSE',
} as const;

export type SystemAccountCode = (typeof SYSTEM_ACCOUNTS)[keyof typeof SYSTEM_ACCOUNTS];

/** Well-known email identifying the market-maker bot's system user account. */
export const MARKET_MAKER_EMAIL = 'marketmaker@system.local';

/** Seed balances granted to the market-maker bot once, on first boot. */
export const MARKET_MAKER_SEED_BALANCES: Record<string, string> = {
  BTC: '10',
  ETH: '100',
  SOL: '2000',
  USDT: '5000000',
};

/** Per-market order size the bot quotes at each of its book levels. */
export const MARKET_MAKER_QUOTE_QUANTITY: Record<string, string> = {
  BTCUSDT: '0.05',
  ETHUSDT: '0.5',
  SOLUSDT: '20',
};

/** Basis-point offsets from mid price for the bot's resting levels on each side. */
export const MARKET_MAKER_LEVEL_OFFSETS_BPS = [2, 5, 10];
