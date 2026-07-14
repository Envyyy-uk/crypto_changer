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
} as const;

export type SystemAccountCode = (typeof SYSTEM_ACCOUNTS)[keyof typeof SYSTEM_ACCOUNTS];
