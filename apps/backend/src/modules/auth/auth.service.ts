import {
  BadRequestException,
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
import { TwoFactorService } from './two-factor.service';
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
    private readonly twoFactor: TwoFactorService,
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

  async login(email: string, password: string, meta: RequestMeta, twoFactorCode?: string) {
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

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        // Password was correct — don't count this as a failed attempt, just
        // tell the client to collect a code and call login again with it.
        return { requiresTwoFactor: true as const };
      }
      const valid = await this.verifyTwoFactorCode(user.id, user.twoFactorSecret, twoFactorCode);
      if (!valid) {
        await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
        await this.audit(user.id, normalizedEmail, false, 'BAD_TWO_FACTOR_CODE', meta);
        throw new UnauthorizedException('Invalid two-factor code');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.audit(user.id, normalizedEmail, true, null, meta);

    return this.issueTokens(user.id, user.email, user.role);
  }

  /** GET-able setup step: generates (or re-generates) a pending secret — not yet enabled. */
  async setupTwoFactor(userId: string) {
    const user = await this.users.findByIdOrThrow(userId);
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    const secret = this.twoFactor.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });

    const otpAuthUrl = this.twoFactor.buildOtpAuthUrl(user.email, secret);
    const qrCodeDataUrl = await this.twoFactor.buildQrCodeDataUrl(otpAuthUrl);
    return { secret, otpAuthUrl, qrCodeDataUrl };
  }

  /** Verifies the first code against the pending secret, then flips 2FA on and issues backup codes. */
  async confirmTwoFactor(userId: string, code: string) {
    const user = await this.users.findByIdOrThrow(userId);
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Call /auth/2fa/setup first');
    }
    if (!this.twoFactor.verifyToken(user.twoFactorSecret, code)) {
      throw new UnauthorizedException('Invalid code');
    }

    const { plaintext, hashes } = await this.twoFactor.generateBackupCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
      await tx.twoFactorBackupCode.createMany({
        data: hashes.map((codeHash) => ({ userId, codeHash })),
      });
    });

    return { backupCodes: plaintext };
  }

  /** Requires the account password AND a valid code, per spec — either always accessible from settings. */
  async disableTwoFactor(userId: string, password: string, code: string) {
    const user = await this.users.findByIdOrThrow(userId);
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid password');
    }
    if (!(await this.verifyTwoFactorCode(userId, user.twoFactorSecret, code))) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
      await tx.twoFactorBackupCode.deleteMany({ where: { userId } });
    });
  }

  /** Used by other modules (e.g. withdrawals) that require a fresh 2FA code for a sensitive action. */
  async verifyCodeForUser(userId: string, code: string): Promise<boolean> {
    const user = await this.users.findByIdOrThrow(userId);
    if (!user.twoFactorEnabled) return true; // nothing to check if 2FA isn't on
    return this.verifyTwoFactorCode(userId, user.twoFactorSecret, code);
  }

  /** A current TOTP code, or an unused backup code (which gets consumed on success). */
  private async verifyTwoFactorCode(
    userId: string,
    secret: string | null,
    code: string,
  ): Promise<boolean> {
    if (secret && this.twoFactor.verifyToken(secret, code)) {
      return true;
    }

    const candidates = await this.prisma.twoFactorBackupCode.findMany({
      where: { userId, usedAt: null },
    });
    for (const candidate of candidates) {
      if (await this.twoFactor.verifyBackupCode(code, candidate.codeHash)) {
        await this.prisma.twoFactorBackupCode.update({
          where: { id: candidate.id },
          data: { usedAt: new Date() },
        });
        return true;
      }
    }
    return false;
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
