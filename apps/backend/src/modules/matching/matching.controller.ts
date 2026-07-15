import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { MatchingService } from './matching.service';

@Controller('orderbook')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get(':symbol')
  getSnapshot(@Param('symbol') symbol: string) {
    const snapshot = this.matching.getSnapshot(symbol);
    if (!snapshot) {
      throw new NotFoundException(`Unknown market: ${symbol.toUpperCase()}`);
    }
    return snapshot;
  }
}
