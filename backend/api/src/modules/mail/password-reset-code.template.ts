export function buildPasswordResetCodeMail(input: {
  recipientName: string;
  code: string;
  appName?: string;
  expiresMinutes?: number;
}) {
  const appName = input.appName?.trim() || 'Dádiva Go';
  const expiresMinutes = input.expiresMinutes ?? 10;
  const greeting = input.recipientName.trim() || 'Utilizador';
  const code = input.code.trim();

  const subject = `${appName} — código de verificação`;

  const text = [
    `Olá ${greeting},`,
    '',
    `Código: ${code}`,
    '',
    `Válido durante ${expiresMinutes} minutos.`,
    'Se não fez este pedido, ignore este email.',
    '',
    `— ${appName}`,
  ].join('\n');

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
            <td style="height:4px;background:linear-gradient(90deg,#f59e0b,#8b5cf6,#0ea5e9);"></td>
          </tr>
          <tr>
            <td style="padding:32px 28px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b45309;">${escapeHtml(appName)}</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#18181b;">Código de verificação</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#52525b;">Olá ${escapeHtml(greeting)},</p>
              <p style="margin:0 0 24px;text-align:center;">
                <span style="display:inline-block;padding:18px 28px;border-radius:12px;border:2px solid #f59e0b;background:#fffbeb;font-size:32px;font-weight:700;letter-spacing:0.35em;color:#18181b;">${escapeHtml(code)}</span>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">Válido ${expiresMinutes} min. Se não reconhece este pedido, ignore o email.</p>
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
