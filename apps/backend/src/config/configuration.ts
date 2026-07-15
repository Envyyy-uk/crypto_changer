export const configuration = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  lockout: {
    maxAttempts: parseInt(process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS ?? '5', 10),
    durationMinutes: parseInt(process.env.LOGIN_LOCKOUT_DURATION_MINUTES ?? '15', 10),
  },
  testLiquidityUsdt: process.env.TEST_LIQUIDITY_USDT_AMOUNT ?? '100000',
  marketMaker: {
    enabled: (process.env.MARKET_MAKER_ENABLED ?? 'true') === 'true',
    intervalMs: parseInt(process.env.MARKET_MAKER_INTERVAL_MS ?? '5000', 10),
  },
});
