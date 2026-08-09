import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { NormalizeEmailField } from '../../../common/email-transform.decorator';

export class VerifyResetCodeDto {
  @NormalizeEmailField()
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
