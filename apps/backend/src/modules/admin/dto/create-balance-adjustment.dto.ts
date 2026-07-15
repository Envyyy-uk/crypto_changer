import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateBalanceAdjustmentDto {
  @IsString()
  userId!: string;

  @IsString()
  @MaxLength(10)
  asset!: string;

  /** Signed decimal string — positive credits the user, negative debits them. */
  @Matches(/^-?\d+(\.\d+)?$/, { message: 'amount must be a signed decimal string, e.g. "100" or "-50"' })
  amount!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
