import { UserRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
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

  @IsOptional()
  @IsBoolean()
  isCompany?: boolean;

  @ValidateIf((o: AdminUpdateUserDto) => o.isCompany === true)
  @IsString()
  @MaxLength(32)
  @Matches(/\S/, { message: 'O NIF é obrigatório para contas de empresa.' })
  nif?: string;

  /** Apenas contas CLIENT — true activa, false desactiva o acesso. */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
