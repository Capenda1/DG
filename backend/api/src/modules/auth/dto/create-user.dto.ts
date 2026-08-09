import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { NormalizeEmailField } from '../../../common/email-transform.decorator';

export class CreateUserDto {
  @ValidateIf((o: CreateUserDto) => o.role !== UserRole.COLLABORATOR)
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
}
