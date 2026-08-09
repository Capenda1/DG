import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class OpenPdvSessionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingFloat!: number;
}
