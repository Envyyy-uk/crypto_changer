import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradesService } from './trades.service';

@Controller('trades')
@UseGuards(JwtAuthGuard)
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get('history')
  listHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('market') market?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.trades.listHistory(user.userId, { market, page, pageSize });
  }
}
