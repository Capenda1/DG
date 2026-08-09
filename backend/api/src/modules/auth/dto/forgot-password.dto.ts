import { IsEmail } from 'class-validator';
import { NormalizeEmailField } from '../../../common/email-transform.decorator';

export class ForgotPasswordDto {
  @NormalizeEmailField()
  @IsEmail()
  email!: string;
}