import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TradesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Trades where the user was buyer or seller, newest first. */
  listHistory(userId: string, params: { market?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    return this.prisma.trade.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        ...(params.market ? { market: { symbol: params.market.toUpperCase() } } : {}),
      },
      include: { market: { select: { symbol: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  /**
   * Public trade tape for a market: no buyer/seller identity, just price,
   * quantity and the taker's side (the conventional "aggressor" color).
   */
  async listRecent(symbol: string, limit = 50) {
    const trades = await this.prisma.trade.findMany({
      where: { market: { symbol: symbol.toUpperCase() } },
      include: { takerOrder: { select: { side: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
    return trades.map((trade) => ({
      id: trade.id,
      price: trade.price,
      quantity: trade.quantity,
      side: trade.takerOrder.side,
      createdAt: trade.createdAt,
    }));
  }
}
