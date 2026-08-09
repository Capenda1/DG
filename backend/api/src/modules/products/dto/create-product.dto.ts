import { CatalogFamily, ProductStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsEnum(CatalogFamily)
  catalogFamily?: CatalogFamily;

  /** Ex.: `{ "garmentType": "T_SHIRT" }` para linha vestuário. */
  @IsOptional()
  @IsObject()
  familyConfig?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
