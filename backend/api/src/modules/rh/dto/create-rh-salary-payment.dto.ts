import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import type { RhSalaryPaymentType } from '../rh.types';

export class CreateRhSalaryPaymentDto {
  @IsUUID('4')
  userId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  periodKey!: string;

  @IsIn(['salario', 'adiantamento'])
  tipo!: RhSalaryPaymentType;

  @IsNumber()
  @Min(0.01)
  valorAoa!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dataPagamento?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
