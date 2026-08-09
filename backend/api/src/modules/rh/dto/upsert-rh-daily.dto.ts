import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import type { RhDayStatus } from '../rh.types';

export class UpsertRhDailyDto {
  @IsUUID('4')
  userId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsIn(['presente', 'falta_justificada', 'falta_injustificada'])
  status!: RhDayStatus;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  entrada?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  saida?: string;
}

export class RhDailyPunchDto {
  @IsUUID('4')
  userId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsIn(['entrada', 'saida'])
  punch!: 'entrada' | 'saida';

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  hora?: string;
}
