import { formatAngolaPhoneForDisplay } from '../../common/angola-phone.util';
import {
  DEFAULT_TWILIO_SMS_MESSAGE_TEMPLATE,
  DEFAULT_TWILIO_SMS_ONE_WAY_FOOTER,
} from '../settings/settings.service';

export const ORDER_FINISHED_SMS_ONE_WAY_FOOTER = DEFAULT_TWILIO_SMS_ONE_WAY_FOOTER;

export function buildOrderFinishedSmsBody(params: {
  orderNumber: string;
  clientName?: string;
  businessPhone?: string;
  appName?: string;
  messageTemplate?: string;
  oneWayFooter?: string;
}): string {
  const template =
    params.messageTemplate?.trim() || DEFAULT_TWILIO_SMS_MESSAGE_TEMPLATE;
  const footer = params.oneWayFooter ?? DEFAULT_TWILIO_SMS_ONE_WAY_FOOTER;
  const app = (params.appName?.trim() || 'Gráfica Dádiva').slice(0, 40);
  const order = params.orderNumber.trim();
  const contactRaw = params.businessPhone?.trim();

  let contactLine = '';
  if (contactRaw) {
    const contact = formatAngolaPhoneForDisplay(contactRaw) ?? contactRaw;
    contactLine = ` Contacto: ${contact}.`;
  }

  const rodape = footer.trim();

  const msg = template
    .replace(/\{empresa\}/g, app)
    .replace(/\{pedido\}/g, order)
    .replace(/\{contacto\}/g, contactLine)
    .replace(/\{rodape\}/g, rodape);

  return msg.slice(0, 320);
}
