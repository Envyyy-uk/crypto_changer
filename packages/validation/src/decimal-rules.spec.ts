import { computeFee, computeNotional, isMultipleOf, isPositive } from './decimal-rules';

describe('decimal-rules', () => {
  describe('isMultipleOf', () => {
    it('accepts price aligned to tick size', () => {
      expect(isMultipleOf('60000.10', '0.10')).toBe(true);
      expect(isMultipleOf('60000.00', '0.10')).toBe(true);
    });

    it('rejects misaligned price', () => {
      expect(isMultipleOf('60000.15', '0.10')).toBe(false);
      expect(isMultipleOf('60000.001', '0.10')).toBe(false);
    });

    it('handles quantity steps without float artifacts', () => {
      // 0.00003 / 0.00001 is a classic float trap; must be exact here.
      expect(isMultipleOf('0.00003', '0.00001')).toBe(true);
      expect(isMultipleOf('0.000035', '0.00001')).toBe(false);
    });

    it('rejects non-positive steps', () => {
      expect(isMultipleOf('1', '0')).toBe(false);
      expect(isMultipleOf('1', '-0.1')).toBe(false);
    });
  });

  describe('computeNotional', () => {
    it('is exact for spec example: 0.01 BTC × 60000 = 600 USDT', () => {
      expect(computeNotional('60000', '0.01').toString()).toBe('600');
    });

    it('is exact for small quantities', () => {
      expect(computeNotional('60100', '0.02').toString()).toBe('1202');
    });
  });

  describe('computeFee', () => {
    it('matches spec example: 1802 × 0.001 → 1.80 at 2dp', () => {
      expect(computeFee('1802', '0.001', 2).toString()).toBe('1.8');
    });
  });

  describe('isPositive', () => {
    it('accepts positive decimals and rejects zero/negative/garbage', () => {
      expect(isPositive('0.00001')).toBe(true);
      expect(isPositive('0')).toBe(false);
      expect(isPositive('-1')).toBe(false);
      expect(isPositive('abc')).toBe(false);
    });
  });
});
