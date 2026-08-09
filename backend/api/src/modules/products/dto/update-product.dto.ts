import { CatalogFamily, ProductStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsEnum(CatalogFamily)
  catalogFamily?: CatalogFamily;

  @IsOptional()
  @IsObject()
  familyConfig?: Record<string, unknown> | null;

  /**
   * Kwanza (AOA). Legado: `{ [cor]: { adult?, child? } }` (vale para ambos os processos).
   * Por marca: `{ [marcaAdulto]: { [cor]: { adult?, child?, sublimation?, dtf? } } }`
   * (`sublimation` / `dtf`: `{ adult?, child? }`; fallback para `adult`/`child` no topo).
   */
  @IsOptional()
  @IsObject()
  colorPrices?: Record<string, unknown> | null;
}
