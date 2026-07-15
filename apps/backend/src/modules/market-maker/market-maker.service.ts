import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  MARKET_MAKER_EMAIL,
  MARKET_MAKER_LEVEL_OFFSETS_BPS,
  MARKET_MAKER_QUOTE_QUANTITY,
  MARKET_MAKER_SEED_BALANCES,
  SYSTEM_ACCOUNTS,
} from '@crypto-exchange/config';
import { Decimal } from '@crypto-exchange/validation';
import { LedgerEntryDirection, LedgerTransactionType, Market, OrderSide, OrderType } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { MarketDataService } from '../market-data/market-data.service';
import { OrdersService } from '../orders/orders.service';

/**
 * Simulated liquidity provider: a regular system user account that quotes a
 * few levels around the live external price on each side, so the exchange's
 * own order book is never empty for real visitors. It never competes for an
 * edge — self-trade prevention makes it impossible for its own quotes to
 * cross each other, and it always re-quotes at (at worst) the current
 * reference price, never chasing a position.
 */
@Injectable()
export class MarketMakerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketMakerService.name);
  private timer?: NodeJS.Timeout;
  private botUserId: string | null = null;
  private refreshing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly orders: OrdersService,
    private readonly marketData: MarketDataService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (!this.config.get<boolean>('marketMaker.enabled')) {
      this.logger.log('Market-maker disabled (MARKET_MAKER_ENABLED=false)');
      return;
    }

    this.botUserId = await this.ensureBotUser();
    await this.seedBalances(this.botUserId);

    const intervalMs = this.config.get<number>('marketMaker.intervalMs') ?? 5000;
    this.timer = setInterval(() => void this.refreshAll(), intervalMs);
    void this.refreshAll(); // don't wait for the first tick to provide initial liquidity
    this.logger.log(`Market-maker active (user ${this.botUserId}, refresh every ${intervalMs}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async ensureBotUser(): Promise<string> {
    const existing = await this.prisma.user.findUnique({ where: { email: MARKET_MAKER_EMAIL } });
    if (existing) return existing.id;

    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'), { type: argon2.argon2id });
    const created = await this.prisma.user.create({
      data: { email: MARKET_MAKER_EMAIL, passwordHash, emailVerified: true },
    });
    this.logger.log(`Created market-maker system user (${created.id})`);
    return created.id;
  }

  /** Grants the bot's seed balances once — a no-op on every later boot. */
  private async seedBalances(userId: string): Promise<void> {
    const assets = await this.prisma.asset.findMany();
    for (const asset of assets) {
      const seedAmount = MARKET_MAKER_SEED_BALANCES[asset.symbol];
      if (!seedAmount) continue;

      await this.prisma.$transaction(async (tx) => {
        const account = await this.ledger.getOrCreateUserAccount(tx, userId, asset.id);
        const alreadyFunded = new Decimal(account.available.toString())
          .plus(account.locked.toString())
          .greaterThan(0);
        if (alreadyFunded) return;

        const system = await this.ledger.getOrCreateSystemAccount(tx, SYSTEM_ACCOUNTS.TEST_LIQUIDITY, asset.id);
        await this.ledger.postTransaction(tx, {
          type: LedgerTransactionType.TEST_LIQUIDITY_GRANT,
          referenceType: 'USER',
          referenceId: userId,
          description: 'Market-maker seed liquidity',
          entries: [
            { accountId: system.id, direction: LedgerEntryDirection.DEBIT, amount: new Decimal(seedAmount) },
            { accountId: account.id, direction: LedgerEntryDirection.CREDIT, amount: new Decimal(seedAmount) },
          ],
        });
        this.logger.log(`Seeded market-maker with ${seedAmount} ${asset.symbol}`);
      });
    }
  }

  private async refreshAll(): Promise<void> {
    // Skip overlapping ticks if a previous refresh is still settling orders.
    if (this.refreshing || !this.botUserId) return;
    this.refreshing = true;
    try {
      const markets = await this.prisma.market.findMany({ where: { status: 'ACTIVE' } });
      for (const market of markets) {
        try {
          await this.refreshMarket(market);
        } catch (error) {
          this.logger.warn(`Refresh failed for ${market.symbol}: ${(error as Error).message}`);
        }
      }
    } finally {
      this.refreshing = false;
    }
  }

  private async refreshMarket(market: Market): Promise<void> {
    const quantity = MARKET_MAKER_QUOTE_QUANTITY[market.symbol];
    if (!quantity || !this.botUserId) return;

    const ticker = await this.getReferenceTicker(market.symbol);
    if (!ticker) return;

    await this.cancelOwnOpenOrders(market.symbol);

    const tick = new Decimal(market.tickSize.toString());
    for (const bps of MARKET_MAKER_LEVEL_OFFSETS_BPS) {
      const offset = new Decimal(bps).dividedBy(10_000);
      const bidPrice = roundToTick(ticker.times(new Decimal(1).minus(offset)), tick, Decimal.ROUND_DOWN);
      const askPrice = roundToTick(ticker.times(new Decimal(1).plus(offset)), tick, Decimal.ROUND_UP);
      await this.placeQuote(market.symbol, OrderSide.BUY, bidPrice, quantity);
      await this.placeQuote(market.symbol, OrderSide.SELL, askPrice, quantity);
    }
  }

  /**
   * Prefers the live external price; if that feed is missing or stale, falls
   * back to this market's own last trade so the bot can keep quoting through
   * a temporary upstream outage rather than going silent.
   */
  private async getReferenceTicker(symbol: string): Promise<Decimal | null> {
    const ticker = this.marketData.getTicker(symbol);
    if (ticker && !ticker.stale) return new Decimal(ticker.lastPrice);

    const lastTrade = await this.prisma.trade.findFirst({
      where: { market: { symbol } },
      orderBy: { createdAt: 'desc' },
    });
    return lastTrade ? new Decimal(lastTrade.price.toString()) : null;
  }

  private async cancelOwnOpenOrders(symbol: string): Promise<void> {
    const open = await this.orders.listOpen(this.botUserId!);
    const ours = open.filter((order) => order.market.symbol === symbol);
    for (const order of ours) {
      await this.orders.cancelOrder(this.botUserId!, order.id).catch(() => undefined);
    }
  }

  private async placeQuote(symbol: string, side: OrderSide, price: Decimal, quantity: string) {
    try {
      await this.orders.createOrder(this.botUserId!, {
        symbol,
        side,
        type: OrderType.LIMIT,
        price: price.toString(),
        quantity,
      });
    } catch (error) {
      this.logger.debug(`Quote skipped (${symbol} ${side} @ ${price.toString()}): ${(error as Error).message}`);
    }
  }
}

function roundToTick(price: Decimal, tick: Decimal, rounding: Decimal.Rounding): Decimal {
  return price.dividedBy(tick).toDecimalPlaces(0, rounding).times(tick);
}
