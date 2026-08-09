import {
  buildSmtpConfig,
  isSmtpConfigured,
  isSmtpProductionReady,
  readSmtpEnvFromProcess,
} from './smtp.config';

describe('smtp.config', () => {
  it('detecta Gmail configurado com EMAIL_USER e EMAIL_PASS', () => {
    expect(
      isSmtpConfigured({
        user: 'admin@gmail.com',
        pass: 'app-password',
      }),
    ).toBe(true);
  });

  it('exige credenciais para produção', () => {
    expect(
      isSmtpProductionReady({
        user: 'admin@gmail.com',
        pass: 'app-password',
      }),
    ).toBe(true);
    expect(isSmtpProductionReady({ host: 'smtp.gmail.com' })).toBe(false);
  });

  it('normaliza localhost para 127.0.0.1', () => {
    const cfg = buildSmtpConfig({
      host: 'localhost',
      port: '1025',
      user: 'dev',
      pass: 'dev',
      secure: 'false',
      requireTls: 'false',
    });
    expect(cfg?.host).toBe('127.0.0.1');
  });

  it('usa Gmail por defeito quando só há credenciais', () => {
    const cfg = buildSmtpConfig({
      user: 'admin@gmail.com',
      pass: 'secret',
    });
    expect(cfg?.host).toBe('smtp.gmail.com');
    expect(cfg?.port).toBe(587);
    expect(cfg?.requireTls).toBe(true);
  });

  it('lê EMAIL_* do ambiente', () => {
    const env = readSmtpEnvFromProcess({
      EMAIL_HOST: 'smtp.gmail.com',
      EMAIL_PORT: '587',
      EMAIL_USER: 'a@gmail.com',
      EMAIL_PASS: 'pass',
    });
    expect(env.user).toBe('a@gmail.com');
    expect(env.host).toBe('smtp.gmail.com');
  });
});
