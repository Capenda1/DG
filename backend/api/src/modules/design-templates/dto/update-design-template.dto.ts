import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Todos os campos opcionais — definidos manualmente para evitar
 * dependência de @nestjs/mapped-types e compatibilidade com PartialType.
 */
export class UpdateDesignTemplateDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  garmentType?: string;

  @IsString()
  @IsOptional()
  previewKey?: string;

  @IsOptional()
  layersJson?: unknown;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
