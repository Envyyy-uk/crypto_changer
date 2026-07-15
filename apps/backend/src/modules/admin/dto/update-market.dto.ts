import { MarketStatus } from '@prisma/client';
import { IsEnum, IsNumberString, IsOptional } from 'class-validator';

export class UpdateMarketDto {
  @IsOptional()
  @IsEnum(MarketStatus)
  status?: MarketStatus;

  @IsOptional()
  @IsNumberString()
  makerFee?: string;

  @IsOptional()
  @IsNumberString()
  takerFee?: string;
}
