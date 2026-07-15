import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { TwoFactorConfirmDto } from './dto/two-factor-confirm.dto';
import { TwoFactorDisableDto } from './dto/two-factor-disable.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(
      dto.email,
      dto.password,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] },
      dto.twoFactorCode,
    );
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  setupTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.setupTwoFactor(user.userId);
  }

  @Post('2fa/confirm')
  @UseGuards(JwtAuthGuard)
  confirmTwoFactor(@CurrentUser() user: AuthenticatedUser, @Body() dto: TwoFactorConfirmDto) {
    return this.auth.confirmTwoFactor(user.userId, dto.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async disableTwoFactor(@CurrentUser() user: AuthenticatedUser, @Body() dto: TwoFactorDisableDto) {
    await this.auth.disableTwoFactor(user.userId, dto.password, dto.code);
    return { disabled: true };
  }
}
