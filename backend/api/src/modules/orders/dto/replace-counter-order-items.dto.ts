import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderLineDto } from './create-order.dto';

/** Substitui as linhas de um rascunho de balcão (passo 1 → editar artigos). */
export class ReplaceCounterOrderItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  items!: CreateOrderLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
