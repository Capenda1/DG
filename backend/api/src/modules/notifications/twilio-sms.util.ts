/** Mensagem clara para erros da API Twilio (sem expor detalhes internos). */
export function mapTwilioSendError(err: unknown): string {
  const rec = err as {
    code?: number;
    status?: number;
    message?: string;
  };
  const code = rec.code;
  const raw = (rec.message ?? String(err)).trim();
  const lower = raw.toLowerCase();

  if (
    code === 20005 ||
    code === 30002 ||
    lower.includes('suspend') ||
    lower.includes('not active') ||
    lower.includes('account is closed')
  ) {
    return 'A conta Twilio está suspensa ou inactiva. Em console.twilio.com, canto superior direito: Suspended. Regulariza Billing (cartão/saldo) para voltar a enviar SMS.';
  }
  if (
    code === 10001 ||
    lower.includes('insufficient') ||
    lower.includes('funds') ||
    lower.includes('balance') ||
    lower.includes('credit')
  ) {
    return 'Saldo Twilio insuficiente. Recarrega a conta em Billing → Payment ou Purchase credits.';
  }
  if (code === 20003 || rec.status === 401 || lower.includes('authenticate')) {
    return 'Twilio recusou as credenciais. Confirma o Account SID e o Auth Token e guarda de novo.';
  }
  if (code === 21612 || code === 21661 || lower.includes('alphanumeric')) {
    return 'O remetente GRAF DADIVA ainda não está activo na conta Twilio. Activa Alphanumeric Sender ID em Messaging → Settings.';
  }
  if (code === 21408 || lower.includes('permission') || lower.includes('geo')) {
    return 'A conta Twilio não tem permissão para enviar SMS para Angola. Activa Geo permissions → Angola.';
  }
  if (code === 21608 || lower.includes('unverified') || lower.includes('trial')) {
    return 'Conta Twilio Trial: só envia para números verificados na consola (Phone Numbers → Verified Caller IDs).';
  }
  if (code === 21211 || lower.includes('not a valid phone')) {
    return 'Número de destino inválido para a Twilio.';
  }
  if (lower.includes('from') && (lower.includes('not a valid') || lower.includes('invalid'))) {
    return 'Remetente rejeitado pela Twilio. Usa o sender alfanumérico GRAF DADIVA com Alphanumeric Sender ID activo.';
  }

  const short = raw.replace(/^Falha ao enviar SMS:\s*/i, '').slice(0, 280);
  return short || 'A Twilio recusou o envio. Verifica credenciais, remetente e permissões de Angola.';
}

/** Analisa o remetente configurado em TWILIO_SMS_FROM. */
export function analyzeTwilioSmsFrom(from: string): {
  kind: 'alphanumeric' | 'phone';
  isUsNumber: boolean;
  isRecommendedForAngola: boolean;
  /** Sender alfanumérico = canal único (cliente não pode responder). */
  isOneWayChannel: boolean;
  warnings: string[];
} {
  const trimmed = from.trim();
  const warnings: string[] = [];

  if (!trimmed) {
    return {
      kind: 'phone',
      isUsNumber: false,
      isRecommendedForAngola: false,
      isOneWayChannel: false,
      warnings: ['TWILIO_SMS_FROM em falta.'],
    };
  }

  const isPhone = trimmed.startsWith('+') || /^\d/.test(trimmed);

  if (!isPhone) {
    if (trimmed.length > 11) {
      warnings.push('Sender alfanumérico: máximo 11 caracteres.');
    }
    if (!/[A-Za-z]/.test(trimmed)) {
      warnings.push('Sender alfanumérico deve conter pelo menos uma letra.');
    }
    return {
      kind: 'alphanumeric',
      isUsNumber: false,
      isRecommendedForAngola: true,
      isOneWayChannel: true,
      warnings,
    };
  }

  const digits = trimmed.replace(/\D/g, '');
  const isUsNumber = digits.startsWith('1');

  if (isUsNumber) {
    warnings.push(
      'Remetente +1 (EUA): clientes em Angola desconfiam. Use sender alfanumérico "GRAF DADIVA" ou número +244.',
    );
  }

  warnings.push(
    'Remetente numérico permite resposta do cliente — use sender alfanumérico para canal único.',
  );

  return {
    kind: 'phone',
    isUsNumber,
    isRecommendedForAngola: !isUsNumber && digits.startsWith('244'),
    isOneWayChannel: false,
    warnings,
  };
}