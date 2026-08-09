import { ProductionProcess } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  size?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  baseColor?: string;

  @IsEnum(ProductionProcess)
  productionProcess!: ProductionProcess;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  garmentType?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
