export function buildOrderCustomerNotifyMail(input: {
  recipientName: string;
  orderNumber: string;
  businessPhone?: string;
  appName?: string;
}) {
  const appName = input.appName?.trim() || 'Gráfica Dádiva';
  const greeting = input.recipientName.trim() || 'Cliente';
  const orderNumber = input.orderNumber.trim();
  const contact = input.businessPhone?.trim();

  const subject = `${appName} — pedido ${orderNumber} pronto para recolha`;

  const textLines = [
    `Olá ${greeting},`,
    '',
    `O pedido ${orderNumber} está finalizado e pronto para recolha.`,
  ];
  if (contact) {
    textLines.push('', `Contacto: ${contact}`);
  }
  textLines.push('', `— ${appName}`);
  const text = textLines.join('\n');

  const contactHtml = contact
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52525b;">Contacto: <strong style="color:#18181b;">${escapeHtml(contact)}</strong></p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#f59e0b,#d97706);"></td>
          </tr>
          <tr>
            <td style="padding:32px 28px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b45309;">${escapeHtml(appName)}</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#18181b;">Pedido pronto para recolha</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52525b;">Olá ${escapeHtml(greeting)},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52525b;">O pedido <strong style="color:#18181b;">${escapeHtml(orderNumber)}</strong> está finalizado e pronto para recolha.</p>
              ${contactHtml}
              <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">Mensagem enviada pela equipa da ${escapeHtml(appName)}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
