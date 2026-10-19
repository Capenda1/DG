import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export const ORDER_NOTIFY_CHANNELS = ['SMS', 'EMAIL', 'WHATSAPP'] as const;
export type OrderNotifyChannelDto = (typeof ORDER_NOTIFY_CHANNELS)[number];

export class NotifyOrderCustomerDto {
  @IsString()
  @IsIn(ORDER_NOTIFY_CHANNELS)
  channel!: OrderNotifyChannelDto;

  /** Obrigatório quando já existe envio com sucesso para o mesmo canal neste pedido. */
  @IsOptional()
  @IsBoolean()
  confirmResend?: boolean;
}
