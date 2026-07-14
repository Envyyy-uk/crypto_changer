import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BalancesService } from './balances.service';

@Controller('balances')
@UseGuards(JwtAuthGuard)
export class BalancesController {
  constructor(private readonly balances: BalancesService) {}

  @Get()
  getBalances(@CurrentUser() user: AuthenticatedUser) {
    return this.balances.getBalances(user.userId);
  }
}
