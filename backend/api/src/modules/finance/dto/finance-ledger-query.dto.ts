import { OrderOrigin, PaymentMethod } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { FinanceDateRangeDto } from './finance-date-range.dto';

const PAYMENT_METHODS = Object.values(PaymentMethod) as PaymentMethod[];
const ORDER_ORIGINS: OrderOrigin[] = [OrderOrigin.BALCAO, OrderOrigin.ONLINE];

export class FinanceLedgerQueryDto extends FinanceDateRangeDto {
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsIn(ORDER_ORIGINS)
  orderOrigin?: OrderOrigin;
}
