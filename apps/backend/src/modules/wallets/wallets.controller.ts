import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WalletsService } from './wallets.service';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Post('deposits')
  createDeposit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepositDto) {
    return this.wallets.createDeposit(user.userId, dto);
  }

  @Get('deposits')
  listDeposits(@CurrentUser() user: AuthenticatedUser) {
    return this.wallets.listDeposits(user.userId);
  }

  @Post('withdrawals')
  createWithdrawal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWithdrawalDto) {
    return this.wallets.createWithdrawal(user.userId, dto);
  }

  @Get('withdrawals')
  listWithdrawals(@CurrentUser() user: AuthenticatedUser) {
    return this.wallets.listWithdrawals(user.userId);
  }
}
