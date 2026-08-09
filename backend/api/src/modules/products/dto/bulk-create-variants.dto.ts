import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductVariantDto } from './create-variant.dto';

/** Criação em lote — um pedido HTTP em vez de N variantes individuais. */
export class BulkCreateVariantsDto {
  @IsArray()
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants!: CreateProductVariantDto[];
}
