import { OrderSide, OrderType } from '@prisma/client';
import { IsEnum, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsEnum(OrderSide)
  side!: OrderSide;

  @IsEnum(OrderType)
  type!: OrderType;

  /** Decimal string, e.g. "60000". Required for LIMIT orders. */
  @IsOptional()
  @IsNumberString()
  price?: string;

  /** Decimal string, e.g. "0.01". */
  @IsNumberString()
  quantity!: string;
}
