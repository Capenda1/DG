import { mapSmtpSendError } from './smtp.errors';

describe('mapSmtpSendError', () => {
  it('mapeia EAUTH com senha de app Gmail', () => {
    const err = Object.assign(new Error('Invalid login'), {
      code: 'EAUTH',
      responseCode: 534,
      response: 'Application-specific password required',
    });
    const mapped = mapSmtpSendError(err);
    expect(mapped.message).toContain('Senha de App');
  });

  it('mapeia ECONNREFUSED', () => {
    const err = Object.assign(new Error('connect refused'), {
      code: 'ECONNREFUSED',
    });
    const mapped = mapSmtpSendError(err);
    expect(mapped.message).toContain('ligação');
  });
});
