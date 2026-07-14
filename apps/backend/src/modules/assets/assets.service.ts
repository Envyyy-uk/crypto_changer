import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.asset.findMany({ orderBy: { symbol: 'asc' } });
  }

  async findBySymbolOrThrow(symbol: string) {
    const asset = await this.prisma.asset.findUnique({ where: { symbol } });
    if (!asset) throw new NotFoundException(`Unknown asset: ${symbol}`);
    return asset;
  }
}
