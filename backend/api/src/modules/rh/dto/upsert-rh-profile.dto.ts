import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import type { RhContractStatus } from '../rh.types';

export class UpsertRhProfileDto {
  @IsOptional()
  @IsString()
  nif?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsString()
  departamento?: string;

  @IsOptional()
  @IsString()
  gestorDireto?: string;

  @IsOptional()
  @IsString()
  dataAdmissao?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salarioBaseAoa?: number;

  @IsOptional()
  @IsIn(['Ativo', 'Em férias', 'Licença'])
  estadoContrato?: RhContractStatus;
}
