import { IsNumberString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWithdrawalDto {
  @IsString()
  @MaxLength(10)
  asset!: string;

  /** Decimal string, e.g. "500". */
  @IsNumberString()
  amount!: string;

  /** Sandbox address — never a real chain address, no validation beyond length. */
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  address!: string;

  /**
   * Reserved for once 2FA ships (Milestone 5) — accepted now but not yet
   * enforced, since no account can have 2FA enabled today.
   */
  @IsOptional()
  @IsString()
  twoFactorCode?: string;
}
