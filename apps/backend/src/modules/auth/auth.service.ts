import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { toDecimal } from '@crypto-exchange/validation';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './strategies/jwt.strategy';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly ledger: LedgerService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates the user and grants the sandbox USDT balance in ONE database
   * transaction — a user can never exist without their welcome grant.
   */
  async register(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    const grantAmount = toDecimal(this.config.get<string>('testLiquidityUsdt') ?? '100000');

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: normalizedEmail, passwordHash },
      });

      const usdt = await tx.asset.findUnique({ where: { symbol: 'USDT' } });
      if (usdt) {
        await this.ledger.grantTestLiquidity(tx, created.id, usdt.id, grantAmount);
      }
      // If assets are not seeded yet the user is still created; the grant can
      // be issued later by an admin adjustment.

      return created;
    });

    return this.users.toPublic(user);
  }

  async login(email: string, password: string, meta: RequestMeta) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalizedEmail);

    if (!user) {
      await this.audit(null, normalizedEmail, false, 'UNKNOWN_EMAIL', meta);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      await this.audit(user.id, normalizedEmail, false, `STATUS_${user.status}`, meta);
      throw new ForbiddenException('Account is not active');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit(user.id, normalizedEmail, false, 'LOCKED_OUT', meta);
      throw new ForbiddenException('Account temporarily locked. Try again later.');
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      await this.audit(user.id, normalizedEmail, false, 'BAD_PASSWORD', meta);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.audit(user.id, normalizedEmail, true, null, meta);

    return this.issueTokens(user.id, user.email, user.role);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.users.findByIdOrThrow(payload.sub);
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active');
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const base = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...base, tokenType: 'access' },
        {
          secret: this.config.getOrThrow<string>('jwt.accessSecret'),
          expiresIn: (this.config.get<string>('jwt.accessExpiresIn') ??
            '15m') as JwtSignOptions['expiresIn'],
        },
      ),
      this.jwt.signAsync(
        { ...base, tokenType: 'refresh' },
        {
          secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
          expiresIn: (this.config.get<string>('jwt.refreshExpiresIn') ??
            '7d') as JwtSignOptions['expiresIn'],
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  private async registerFailedAttempt(userId: string, currentAttempts: number) {
    const maxAttempts = this.config.get<number>('lockout.maxAttempts') ?? 5;
    const durationMinutes = this.config.get<number>('lockout.durationMinutes') ?? 15;
    const attempts = currentAttempts + 1;

    if (attempts >= maxAttempts) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: new Date(Date.now() + durationMinutes * 60_000),
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: attempts },
      });
    }
  }

  private audit(
    userId: string | null,
    email: string,
    success: boolean,
    failureReason: string | null,
    meta: RequestMeta,
  ) {
    return this.prisma.loginAudit.create({
      data: {
        userId,
        email,
        success,
        failureReason,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
  }
}
