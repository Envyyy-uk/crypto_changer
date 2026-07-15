import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  /** Required only when the account has 2FA enabled — a TOTP or backup code. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  twoFactorCode?: string;
}
