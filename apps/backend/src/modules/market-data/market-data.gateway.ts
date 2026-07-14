import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import { MarketDataService } from './market-data.service';

/**
 * The exchange's own WebSocket: browsers connect here (ws://host:3000/ws),
 * never to the upstream feed directly. Later milestones add order book,
 * trade and private balance/order channels on the same socket.
 */
@WebSocketGateway({ path: '/ws' })
export class MarketDataGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MarketDataGateway.name);
  private readonly clients = new Set<WebSocket>();
  private broadcastTimer?: NodeJS.Timeout;

  constructor(private readonly marketData: MarketDataService) {}

  onModuleInit() {
    // Snapshot broadcast once a second keeps client code trivial and caps fan-out cost.
    this.broadcastTimer = setInterval(() => this.broadcastTickers(), 1_000);
  }

  onModuleDestroy() {
    if (this.broadcastTimer) clearInterval(this.broadcastTimer);
  }

  handleConnection(client: WebSocket) {
    this.clients.add(client);
    client.send(JSON.stringify({ type: 'tickers', data: this.marketData.getTickers() }));
    this.logger.debug(`WS client connected (${this.clients.size} total)`);
  }

  handleDisconnect(client: WebSocket) {
    this.clients.delete(client);
  }

  private broadcastTickers() {
    if (this.clients.size === 0) return;
    const message = JSON.stringify({ type: 'tickers', data: this.marketData.getTickers() });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }
}
