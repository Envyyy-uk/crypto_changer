import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { parseTickerEvent, Ticker } from './ticker.types';

const TRACKED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const STALENESS_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface StoredTicker extends Omit<Ticker, 'updatedAt' | 'stale'> {
  updatedAtMs: number;
}

/**
 * Ingests real market prices from Binance's public combined ticker stream
 * (no API key required) and keeps the latest known ticker per symbol.
 *
 * External market data NEVER feeds the internal order book — it is display
 * data and, later, the reference price for the market-maker bot.
 */
@Injectable()
export class MarketDataService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketDataService.name);
  private readonly tickers = new Map<string, StoredTicker>();
  private socket?: WebSocket;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private shuttingDown = false;

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  getTickers(): Ticker[] {
    const now = Date.now();
    return [...this.tickers.values()].map((t) => ({
      symbol: t.symbol,
      lastPrice: t.lastPrice,
      priceChangePercent24h: t.priceChangePercent24h,
      high24h: t.high24h,
      low24h: t.low24h,
      baseVolume24h: t.baseVolume24h,
      quoteVolume24h: t.quoteVolume24h,
      updatedAt: new Date(t.updatedAtMs).toISOString(),
      stale: now - t.updatedAtMs > STALENESS_MS,
    }));
  }

  getTicker(symbol: string): Ticker | undefined {
    return this.getTickers().find((t) => t.symbol === symbol.toUpperCase());
  }

  private connect() {
    if (this.shuttingDown) return;

    const streams = TRACKED_SYMBOLS.map((s) => `${s.toLowerCase()}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    this.logger.log(`Connecting to market data feed: ${url}`);

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.on('open', () => {
      this.reconnectAttempts = 0;
      this.logger.log('Market data feed connected');
    });

    socket.on('message', (buffer) => {
      try {
        const parsed = parseTickerEvent(JSON.parse(buffer.toString()));
        if (!parsed) return;
        this.tickers.set(parsed.symbol, { ...parsed, updatedAtMs: Date.now() });
        this.emit('ticker', this.getTicker(parsed.symbol));
      } catch {
        // Malformed frame — ignore; the stream self-heals.
      }
    });

    socket.on('error', (error) => {
      this.logger.warn(`Market data feed error: ${error.message}`);
    });

    socket.on('close', () => {
      if (this.shuttingDown) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
      this.reconnectAttempts += 1;
      this.logger.warn(`Market data feed closed; reconnecting in ${delay} ms`);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }
}
