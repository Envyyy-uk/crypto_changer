import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';

const ISSUER = 'CX Exchange';
const BACKUP_CODE_COUNT = 10;

/**
 * Pure TOTP/backup-code logic, kept free of Prisma/HTTP concerns so it's
 * cheaply unit-testable. Persistence (secret storage, marking codes used)
 * lives in AuthService.
 */
@Injectable()
export class TwoFactorService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  buildOtpAuthUrl(email: string, secret: string): string {
    return authenticator.keyuri(email, ISSUER, secret);
  }

  async buildQrCodeDataUrl(otpAuthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpAuthUrl);
  }

  verifyToken(secret: string, token: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }

  /** Returns the plaintext codes (shown once) alongside their argon2 hashes (what gets stored). */
  async generateBackupCodes(): Promise<{ plaintext: string[]; hashes: string[] }> {
    const plaintext = Array.from({ length: BACKUP_CODE_COUNT }, () => formatBackupCode(randomBytes(5)));
    const hashes = await Promise.all(plaintext.map((code) => argon2.hash(code, { type: argon2.argon2id })));
    return { plaintext, hashes };
  }

  verifyBackupCode(code: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, code).catch(() => false);
  }
}

/** 10 hex chars grouped as XXXXX-XXXXX for readability. */
function formatBackupCode(bytes: Buffer): string {
  const hex = bytes.toString('hex').toUpperCase();
  return `${hex.slice(0, 5)}-${hex.slice(5, 10)}`;
}
