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

export class CreateUserDto {
  @ValidateIf(
    (o: CreateUserDto) =>
      o.role !== UserRole.COLLABORATOR && o.role !== UserRole.CLIENT,
  )
  @NormalizeEmailField()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ValidateIf((o: CreateUserDto) => o.role !== UserRole.COLLABORATOR)
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ValidateIf((o: CreateUserDto) => o.role === UserRole.CLIENT)
  @IsBoolean()
  @IsOptional()
  isCompany?: boolean;

  @ValidateIf(
    (o: CreateUserDto) => o.role === UserRole.CLIENT && o.isCompany === true,
  )
  @IsString()
  @MaxLength(32)
  @Matches(/\S/, { message: 'O NIF é obrigatório para contas de empresa.' })
  nif?: string;
}
