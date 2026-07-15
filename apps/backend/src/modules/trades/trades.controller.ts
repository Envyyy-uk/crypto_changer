import {
  Controller,
  Get,
  ParseIntPipe,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradesService } from './trades.service';

@Controller('trades')
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get('history')
  @UseGuards(JwtAuthGuard)
  listHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('market') market?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.trades.listHistory(user.userId, { market, page, pageSize });
  }

  /** Public trade tape — no authentication, no buyer/seller identity exposed. */
  @Get('recent/:symbol')
  listRecent(
    @Param('symbol') symbol: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.trades.listRecent(symbol, limit);
  }
}
