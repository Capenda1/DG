import {
  Allow,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** PNG em base64 (opcionalmente com prefixo data:image/png;base64,). */
export class SaveCompositionDto {
  @IsString()
  @MinLength(64)
  @MaxLength(22_000_000)
  pngBase64!: string;

  /** Camadas serializáveis para reabrir o editor (texto + imagens com data URL ou ref. a ficheiro do pedido). */
  @IsOptional()
  @Allow()
  layersJson?: unknown;
}
