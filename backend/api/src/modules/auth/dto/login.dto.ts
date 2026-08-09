import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmailField } from '../../../common/email-transform.decorator';

export class LoginDto {
  @NormalizeEmailField()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}
