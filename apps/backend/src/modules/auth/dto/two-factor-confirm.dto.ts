import { IsString, Length } from 'class-validator';

export class TwoFactorConfirmDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
