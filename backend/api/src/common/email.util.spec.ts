import {
  EMAIL_ALREADY_REGISTERED_MESSAGE,
  isValidEmailShape,
  normalizeEmail,
} from './email.util';

describe('email.util', () => {
  it('normaliza para minúsculas e trim', () => {
    expect(normalizeEmail('  Admin@Test.COM  ')).toBe('admin@test.com');
  });

  it('valida formato básico', () => {
    expect(isValidEmailShape('a@b.co')).toBe(true);
    expect(isValidEmailShape('invalid')).toBe(false);
  });

  it('mensagem de email duplicado', () => {
    expect(EMAIL_ALREADY_REGISTERED_MESSAGE).toBe(
      'Este Email já está registado.',
    );
  });
});
