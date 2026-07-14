import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarketsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.market.findMany({
      include: { baseAsset: true, quoteAsset: true },
      orderBy: { symbol: 'asc' },
    });
  }

  async findBySymbolOrThrow(symbol: string) {
    const market = await this.prisma.market.findUnique({
      where: { symbol },
      include: { baseAsset: true, quoteAsset: true },
    });
    if (!market) throw new NotFoundException(`Unknown market: ${symbol}`);
    return market;
  }
}
