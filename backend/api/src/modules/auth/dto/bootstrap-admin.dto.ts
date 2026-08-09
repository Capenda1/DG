import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmailField } from '../../../common/email-transform.decorator';

export class BootstrapAdminDto {
  @NormalizeEmailField()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
