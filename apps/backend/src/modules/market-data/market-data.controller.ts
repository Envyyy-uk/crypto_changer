import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { isKlineInterval, MarketDataService } from './market-data.service';

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

  @Get('klines/:symbol')
  async getKlines(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1h',
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 500,
  ) {
    if (!isKlineInterval(interval)) {
      throw new BadRequestException('interval must be one of: 1m, 5m, 15m, 1h, 4h, 1d');
    }
    try {
      return await this.marketData.getKlines(symbol, interval, limit);
    } catch {
      throw new BadGatewayException('Candles are temporarily unavailable');
    }
  }
}
