type SmtpErrorLike = Error & {
  code?: string;
  response?: string;
  responseCode?: number;
  command?: string;
};

export function mapSmtpSendError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new Error('Erro ao enviar email. Tente novamente mais tarde.');
  }

  const error = err as SmtpErrorLike;
  const response = error.response ?? '';

  if (error.code === 'EAUTH') {
    if (
      error.responseCode === 534 ||
      response.includes('Application-specific password')
    ) {
      return new Error(
        'O Gmail exige uma Senha de App. Gere uma em https://myaccount.google.com/apppasswords',
      );
    }
    if (error.responseCode === 535) {
      return new Error(
        'Credenciais Gmail inválidas. Use uma Senha de App (não a palavra-passe normal).',
      );
    }
    return new Error(
      'Erro de autenticação SMTP. Verifique EMAIL_USER e EMAIL_PASS.',
    );
  }

  if (error.code === 'ECONNECTION' || error.code === 'ECONNREFUSED') {
    return new Error(
      'Erro de ligação ao servidor SMTP. Verifique EMAIL_HOST e EMAIL_PORT.',
    );
  }

  if (error.code === 'ETIMEDOUT') {
    return new Error('Timeout ao ligar ao servidor SMTP.');
  }

  return error;
}
