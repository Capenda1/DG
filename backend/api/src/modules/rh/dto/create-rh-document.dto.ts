import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import type { RhDocumentStatus, RhDocumentType } from '../rh.types';

export class CreateRhDocumentDto {
  @IsUUID('4')
  userId!: string;

  @IsIn(['BI', 'Contrato', 'NIF', 'Certificado', 'Extrato', 'Outro'])
  tipo!: RhDocumentType;

  @IsString()
  referencia!: string;

  @IsOptional()
  @IsString()
  validade?: string;

  @IsIn(['Carregado', 'Pendente', 'Expirado'])
  estado!: RhDocumentStatus;
}

export class CreateRhAttendanceDto {
  @IsUUID('4')
  userId!: string;

  @IsOptional()
  @IsString()
  periodKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  diasTrabalhados?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  faltasJustificadas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  faltasInjustificadas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  atrasos?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  horasExtra?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  saldoFeriasDias?: number;
}
