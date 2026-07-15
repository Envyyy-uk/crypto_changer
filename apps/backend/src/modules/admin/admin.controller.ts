import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { CreateBalanceAdjustmentDto } from './dto/create-balance-adjustment.dto';
import { UpdateMarketDto } from './dto/update-market.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.admin.listUsers(page, pageSize);
  }

  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.admin.getUserDetail(id);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.admin.updateUserStatus(admin.userId, id, dto);
  }

  @Get('markets')
  listMarkets() {
    return this.admin.listMarkets();
  }

  @Patch('markets/:symbol')
  updateMarket(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('symbol') symbol: string,
    @Body() dto: UpdateMarketDto,
  ) {
    return this.admin.updateMarket(admin.userId, symbol, dto);
  }

  @Post('balance-adjustments')
  createBalanceAdjustment(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateBalanceAdjustmentDto,
  ) {
    return this.admin.createBalanceAdjustment(admin.userId, dto);
  }

  @Get('market-maker/status')
  marketMakerStatus() {
    return this.admin.marketMakerStatus();
  }

  @Post('market-maker/pause')
  pauseMarketMaker(@CurrentUser() admin: AuthenticatedUser) {
    return this.admin.pauseMarketMaker(admin.userId);
  }

  @Post('market-maker/resume')
  resumeMarketMaker(@CurrentUser() admin: AuthenticatedUser) {
    return this.admin.resumeMarketMaker(admin.userId);
  }

  @Get('audit-log')
  listAuditLog(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query('targetType') targetType?: string,
  ) {
    return this.admin.listAuditLog({ page, pageSize, targetType });
  }
}
