import { OrderStatus, PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ChangeOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  /**
   * Opcional: grava ou actualiza o método de pagamento no pedido quando enviado.
   * Clientes não devem usar PATCH para DRAFT → SUBMITTED (usar POST /orders/:id/submit).
   */
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
