import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreateOrderLineDto } from './create-order.dto';

const PDV_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.PDV_CASH,
  PaymentMethod.PDV_DEBIT_CARD,
];

export function isPdvPaymentMethod(pm: PaymentMethod): boolean {
  return PDV_PAYMENT_METHODS.includes(pm);
}

export class QuickBalcaoClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isCompany?: boolean;

  @ValidateIf((o: QuickBalcaoClientDto) => o.isCompany === true)
  @IsString()
  @MaxLength(32)
  @Matches(/\S/, { message: 'O NIF é obrigatório para contas de empresa.' })
  nif?: string;
}

export class CreateCounterOrderDto {
  /** Utilizador já registado como CLIENT. Obrigatório se não enviar `quickClient`. */
  @ValidateIf((o: CreateCounterOrderDto) => !o.quickClient)
  @IsUUID('4')
  clientId?: string;

  /** Dados mínimos para criar cliente no acto (nome + telefone opcional). */
  @ValidateIf((o: CreateCounterOrderDto) => !o.clientId)
  @ValidateNested()
  @Type(() => QuickBalcaoClientDto)
  quickClient?: QuickBalcaoClientDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  items!: CreateOrderLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
