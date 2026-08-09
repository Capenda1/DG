import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional } from 'class-validator';

export class CashFlowReportQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsIn(['daily', 'monthly', 'yearly'])
  granularity?: string;

  /** Substitui o saldo gravado para a data inicial do período. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openingBalanceOverride?: number;
}
