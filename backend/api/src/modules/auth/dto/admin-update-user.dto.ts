import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmailField } from '../../../common/email-transform.decorator';

/** Atualização parcial por administrador (pelo menos um campo no serviço). */
export class AdminUpdateUserDto {
  @IsOptional()
  @NormalizeEmailField()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
