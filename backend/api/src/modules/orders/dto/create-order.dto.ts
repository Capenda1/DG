import { ProductionProcess } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateOrderLineDto {
  /** Se definido, o servidor preenche nome, preço e processo a partir da variante activa. */
  @IsOptional()
  @IsUUID('4')
  productVariantId?: string;

  /**
   * Venda de insumo ao balcão (PDV): não misturar com `productVariantId`.
   * O servidor fixa processo STORE_RETAIL e metadados de stock.
   */
  @ValidateIf((o: CreateOrderLineDto) => Boolean(o.insumoId?.trim?.()))
  @IsUUID('4')
  insumoId?: string;

  /** Legado ou linha manual: obrigatório quando não há variante nem insumoId. */
  @ValidateIf(
    (o: CreateOrderLineDto) =>
      !o.productVariantId && !String(o.insumoId ?? '').trim(),
  )
  @IsString()
  @MinLength(2)
  @MaxLength(256)
  productName?: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  /** Obrigatório quando não há productVariantId (insumo ou legado manual). */
  @ValidateIf((o: CreateOrderLineDto) => !o.productVariantId)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice?: number;

  /** Obrigatório apenas em linha manual sem insumo nem variante. */
  @ValidateIf(
    (o: CreateOrderLineDto) =>
      !o.productVariantId && !String(o.insumoId ?? '').trim(),
  )
  @IsEnum(ProductionProcess)
  productionProcess?: ProductionProcess;

  /** Largura em metros (Lona/Vinil — preço por m²). */
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  widthM?: number;

  /** Altura em metros (Lona/Vinil — preço por m²). */
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  heightM?: number;
}

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  items!: CreateOrderLineDto[];
}
