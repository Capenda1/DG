import { resolveMailProvider } from './mail-provider.util';

describe('resolveMailProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('prefere resend em auto quando a chave existe', () => {
    expect(
      resolveMailProvider('auto', {
        resendApiKey: 're_test',
      }),
    ).toBe('resend');
  });

  it('usa smtp em auto quando Gmail está configurado', () => {
    process.env.EMAIL_USER = 'admin@gmail.com';
    process.env.EMAIL_PASS = 'app-password';
    expect(resolveMailProvider('auto', {})).toBe('smtp');
  });

  it('devolve none quando nada está configurado', () => {
    expect(resolveMailProvider('auto', {})).toBe('none');
  });
});
