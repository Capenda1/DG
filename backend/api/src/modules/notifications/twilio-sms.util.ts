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