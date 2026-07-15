import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Decimal as ValidationDecimal } from '@crypto-exchange/validation';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Serializes Decimal values as strings so monetary values are never coerced
 * to floating point on the wire. Handles both Prisma's bundled decimal.js
 * (query results) and our own decimal.js import in packages/validation
 * (e.g. the matching engine's order book) — they are different module
 * instances, so neither `instanceof` check subsumes the other.
 */
@Injectable()
export class DecimalSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => serialize(data)));
  }
}

function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal || value instanceof ValidationDecimal) {
    return value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(val);
    }
    return out;
  }
  return value;
}
