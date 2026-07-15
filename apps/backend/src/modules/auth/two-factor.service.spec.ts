import { authenticator } from 'otplib';
import { TwoFactorService } from './two-factor.service';

describe('TwoFactorService', () => {
  let service: TwoFactorService;

  beforeEach(() => {
    service = new TwoFactorService();
  });

  describe('secret + TOTP verification', () => {
    it('generates a secret and accepts the code it currently produces', () => {
      const secret = service.generateSecret();
      const code = authenticator.generate(secret);
      expect(service.verifyToken(secret, code)).toBe(true);
    });

    it('rejects a code generated from a different secret', () => {
      const secret = service.generateSecret();
      const otherSecret = service.generateSecret();
      const codeFromOther = authenticator.generate(otherSecret);
      expect(service.verifyToken(secret, codeFromOther)).toBe(false);
    });

    it('rejects garbage input without throwing', () => {
      const secret = service.generateSecret();
      expect(service.verifyToken(secret, 'not-a-code')).toBe(false);
    });
  });

  describe('otpauth URL + QR', () => {
    it('builds a valid otpauth:// URL with the issuer and account name', () => {
      const secret = service.generateSecret();
      const url = service.buildOtpAuthUrl('alice@example.com', secret);
      expect(url).toMatch(/^otpauth:\/\/totp\//);
      expect(url).toContain('CX%20Exchange');
      expect(url).toContain('alice%40example.com');
    });

    it('renders a data URL for the QR code', async () => {
      const secret = service.generateSecret();
      const url = service.buildOtpAuthUrl('alice@example.com', secret);
      const dataUrl = await service.buildQrCodeDataUrl(url);
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('backup codes', () => {
    it('generates 10 unique codes, each verifiable only against its own hash', async () => {
      const { plaintext, hashes } = await service.generateBackupCodes();
      expect(plaintext).toHaveLength(10);
      expect(new Set(plaintext).size).toBe(10);

      expect(await service.verifyBackupCode(plaintext[0], hashes[0])).toBe(true);
      expect(await service.verifyBackupCode(plaintext[0], hashes[1])).toBe(false);
      expect(await service.verifyBackupCode('WRONG-CODE', hashes[0])).toBe(false);
    });
  });
});
