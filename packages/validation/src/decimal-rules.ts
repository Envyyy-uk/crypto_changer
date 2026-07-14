import Decimal from 'decimal.js';

// Financial arithmetic must be exact: enough significant digits for
// NUMERIC(36,18) values and their products.
Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export type DecimalInput = Decimal.Value;

export function toDecimal(value: DecimalInput): Decimal {
  return new Decimal(value);
}

/** True if `value` is a positive, finite decimal (> 0). */
export function isPositive(value: DecimalInput): boolean {
  try {
    const d = new Decimal(value);
    return d.isFinite() && d.greaterThan(0);
  } catch {
    return false;
  }
}

/**
 * True if `value` is an exact integer multiple of `step`
 * (e.g. price aligns to tickSize, quantity aligns to quantityStep).
 */
export function isMultipleOf(value: DecimalInput, step: DecimalInput): boolean {
  const v = new Decimal(value);
  const s = new Decimal(step);
  if (!v.isFinite() || !s.isFinite() || s.lessThanOrEqualTo(0)) return false;
  return v.modulo(s).isZero();
}

/** notional = price × quantity, exact. */
export function computeNotional(price: DecimalInput, quantity: DecimalInput): Decimal {
  return new Decimal(price).times(quantity);
}

/** fee = amount × rate, rounded to `scale` decimal places (half-up). */
export function computeFee(amount: DecimalInput, rate: DecimalInput, scale: number): Decimal {
  return new Decimal(amount).times(rate).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export { Decimal };
