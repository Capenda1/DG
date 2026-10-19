import { analyzeTwilioSmsFrom, mapTwilioSendError } from './twilio-sms.util';

describe('twilio-sms.util', () => {
  it('detecta sender alfanumérico recomendado (canal único)', () => {
    const r = analyzeTwilioSmsFrom('GRAF DADIVA');
    expect(r.kind).toBe('alphanumeric');
    expect(r.isRecommendedForAngola).toBe(true);
    expect(r.isOneWayChannel).toBe(true);
    expect(r.isUsNumber).toBe(false);
  });

  it('remetente numérico não é canal único', () => {
    const r = analyzeTwilioSmsFrom('+244923865632');
    expect(r.kind).toBe('phone');
    expect(r.isOneWayChannel).toBe(false);
  });

  it('avisa número +1 EUA', () => {
    const r = analyzeTwilioSmsFrom('+17432285276');
    expect(r.kind).toBe('phone');
    expect(r.isUsNumber).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('aceita número +244', () => {
    const r = analyzeTwilioSmsFrom('+244923865632');
    expect(r.isRecommendedForAngola).toBe(true);
    expect(r.isUsNumber).toBe(false);
  });
});

describe('mapTwilioSendError', () => {
  it('traduz falha de autenticação', () => {
    expect(mapTwilioSendError({ code: 20003, message: 'Authenticate' })).toMatch(
      /credenciais/i,
    );
  });

  it('traduz sender alfanumérico inactivo', () => {
    expect(
      mapTwilioSendError({ code: 21612, message: 'Alphanumeric Sender ID' }),
    ).toMatch(/Alphanumeric Sender ID/i);
  });

  it('traduz conta suspensa', () => {
    expect(
      mapTwilioSendError({ code: 20005, message: 'Account is not active' }),
    ).toMatch(/suspensa/i);
  });

  it('traduz saldo insuficiente', () => {
    expect(
      mapTwilioSendError({ code: 10001, message: 'Insufficient funds' }),
    ).toMatch(/Saldo/i);
  });
});
