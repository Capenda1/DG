import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateDesignTemplateDto {
  @IsString()
  @MinLength(2)
  title: string;

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

  /** Array de camadas serializado — TextLayerEx | ImageLayerEx. */
  @IsArray()
  @IsOptional()
  layersJson?: unknown[];

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}
