import { IsString, MinLength } from 'class-validator';

export class MfaVerifyLoginDto {
  @IsString()
  @MinLength(10)
  mfaToken!: string;

  @IsString()
  @MinLength(6)
  code!: string;
}
