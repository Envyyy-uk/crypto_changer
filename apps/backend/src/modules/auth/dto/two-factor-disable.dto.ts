import { IsString, MaxLength, MinLength } from 'class-validator';

export class TwoFactorDisableDto {
  @IsString()
  @MaxLength(128)
  password!: string;

  /** A current TOTP code or an unused backup code. */
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}
