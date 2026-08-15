import {
  IsBoolean,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/\S/, { message: 'O nome é obrigatório.' })
  name!: string;

  @IsString()
  @MaxLength(32)
  phone!: string;

  @IsBoolean()
  isCompany!: boolean;

  @ValidateIf((dto: RegisterClientDto) => dto.isCompany)
  @IsString()
  @MaxLength(32)
  @Matches(/\S/, { message: 'O NIF é obrigatório para contas de empresa.' })
  nif?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
