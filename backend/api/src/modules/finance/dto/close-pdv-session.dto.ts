import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PdvMovementDto } from './pdv-movement.dto';

export class ClosePdvSessionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  declaredCash!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  closeNotes?: string;

  /**
   * Saídas registadas apenas no momento do fecho (cada uma vira uma linha
   * imutável no razão antes de calcular o saldo esperado).
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PdvMovementDto)
  withdrawalsAtClose?: PdvMovementDto[];
}
