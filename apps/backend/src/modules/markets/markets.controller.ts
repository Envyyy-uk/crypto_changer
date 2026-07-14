import { Controller, Get, Param } from '@nestjs/common';
import { MarketsService } from './markets.service';

@Controller('markets')
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  @Get()
  findAll() {
    return this.markets.findAll();
  }

  @Get(':symbol')
  findOne(@Param('symbol') symbol: string) {
    return this.markets.findBySymbolOrThrow(symbol.toUpperCase());
  }
}
