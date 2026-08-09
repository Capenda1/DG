import { Type } from 'class-transformer';
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class PdvMovementDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(3, { message: 'Indique uma justificação (min. 3 caracteres).' })
  @MaxLength(2000)
  justification!: string;
}
