import { buildOrderFinishedSmsBody } from './order-finished-sms.template';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildOrderFinishedEmail(params: {
  orderNumber: string;
  clientName?: string;
  businessPhone?: string;
  appName?: string;
  orderUrl: string;
  messageTemplate?: string;
  oneWayFooter?: string;
}): { subject: string; html: string; text: string } {
  const app = (params.appName?.trim() || 'Gráfica Dádiva').slice(0, 40);
  const order = params.orderNumber.trim();
  const textBody = buildOrderFinishedSmsBody({
    orderNumber: params.orderNumber,
    clientName: params.clientName,
    businessPhone: params.businessPhone,
    appName: params.appName,
    messageTemplate: params.messageTemplate,
    oneWayFooter: params.oneWayFooter,
  });

  const subject = `${app}: pedido ${order} pronto para recolha`;
  const orderUrl = params.orderUrl.trim();

  const html = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;max-width:32rem">
  <p>${escapeHtml(textBody)}</p>
  ${
    orderUrl
      ? `<p style="margin-top:1.25rem"><a href="${escapeHtml(orderUrl)}">Ver pedido na aplicação</a></p>`
      : ''
  }
</body>
</html>`;

  const text = orderUrl
    ? `${textBody}\n\nVer pedido: ${orderUrl}`
    : textBody;

  return { subject, html, text };
}
