import { IsNumberString, IsString, MaxLength } from 'class-validator';

export class CreateDepositDto {
  @IsString()
  @MaxLength(10)
  asset!: string;

  /** Decimal string, e.g. "1000". */
  @IsNumberString()
  amount!: string;
}
