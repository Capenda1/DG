import { CashFlowProjectionDirection } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CashFlowProjectionUpsertDto {
  @IsDateString()
  expectedDate!: string;

  @IsEnum(CashFlowProjectionDirection)
  direction!: CashFlowProjectionDirection;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  category!: string;

  @IsString()
  @MinLength(3, {
    message: 'Indique o motivo ou nota sobre a previsão (mín. 3 caracteres).',
  })
  @MaxLength(2000)
  description!: string;
}
