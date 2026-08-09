import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const CATALOG_FAMILIES = [
  'VESTUARIO',
  'CANECA',
  'IMPRESSAO_PLANA',
  'SERVICO',
  'GENERICO',
] as const;

const GARMENT_TYPES = ['T_SHIRT', 'POLO', 'COLETE', 'BONE', 'PERSONALIZADO', 'EQUIPAMENTOS'] as const;

export class CatalogTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id!: string;

  @IsIn([...CATALOG_FAMILIES])
  catalogFamily!: (typeof CATALOG_FAMILIES)[number];

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
  @MaxLength(512)
  hint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  accent?: string;

  @IsOptional()
  @IsIn([...GARMENT_TYPES])
  garmentType?: (typeof GARMENT_TYPES)[number];

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SaveCatalogTemplatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => CatalogTemplateDto)
  templates!: CatalogTemplateDto[];
}
