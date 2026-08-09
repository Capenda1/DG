import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MovimentoTipo } from '@prisma/client';

export class CreateInsumoDto {
  @IsNotEmpty()
  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unidade?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  custoUnit?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0)
  precoVenda?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockMinimo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockActual?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fornecedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  marca?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}

export class UpdateInsumoDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unidade?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  custoUnit?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0)
  precoVenda?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockMinimo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fornecedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  marca?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  activo?: boolean;
}

export class AddInsumoCatalogItemDto {
  @IsIn(['categoria', 'marca', 'unidade'])
  kind: 'categoria' | 'marca' | 'unidade';

  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  value: string;
}

export class CreateMovimentoDto {
  @IsEnum(MovimentoTipo)
  tipo: MovimentoTipo;

  @IsNumber()
  @Min(0.001)
  quantidade: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  custoUnit?: number;

  @IsOptional()
  @IsString()
  nota?: string;
}

export class CreateConsumoDto {
  @IsNotEmpty()
  @IsString()
  insumoId: string;

  @IsOptional()
  @IsString()
  tipoProduto?: string;

  @IsOptional()
  @IsString()
  processo?: string;

  @IsNumber()
  @Min(0.0001)
  qtdPorUnidade: number;
}
