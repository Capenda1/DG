import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CashFlowOtherReceiptDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  category!: string;

  @IsString()
  @MinLength(3, { message: 'Indique o motivo da entrada (mín. 3 caracteres).' })
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string;
}

export class CashFlowExpenseDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  category!: string;

  @IsString()
  @MinLength(3, { message: 'Indique o motivo da saída (mín. 3 caracteres).' })
  @MaxLength(2000)
  description!: string;
}
