import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketData: MarketDataService) {}

  @Get('tickers')
  getTickers() {
    return this.marketData.getTickers();
  }

  @Get('tickers/:symbol')
  getTicker(@Param('symbol') symbol: string) {
    const ticker = this.marketData.getTicker(symbol);
    if (!ticker) {
      throw new NotFoundException(`No ticker for ${symbol.toUpperCase()} (feed warming up?)`);
    }
    return ticker;
  }
}
