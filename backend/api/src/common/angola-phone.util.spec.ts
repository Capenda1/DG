import {
  isAngolaPhoneComplete,
  normalizeAngolaPhoneToE164,
  phoneDigitsOnly,
} from './angola-phone.util';
import { buildOrderFinishedSmsBody } from '../modules/notifications/order-finished-sms.template';

describe('angola-phone.util', () => {
  it('normaliza 244 + 9 dígitos', () => {
    expect(normalizeAngolaPhoneToE164('244923456789')).toBe('+244923456789');
  });

  it('normaliza máscara com espaços', () => {
    expect(normalizeAngolaPhoneToE164('+244 923 456 789')).toBe('+244923456789');
  });

  it('rejeita número incompleto', () => {
    expect(normalizeAngolaPhoneToE164('24492345')).toBeNull();
  });

  it('phoneDigitsOnly remove não-dígitos', () => {
    expect(phoneDigitsOnly('+244 923-456-789')).toBe('244923456789');
  });

  it('isAngolaPhoneComplete', () => {
    expect(isAngolaPhoneComplete('923456789')).toBe(true);
    expect(isAngolaPhoneComplete('123')).toBe(false);
  });
});

describe('buildOrderFinishedSmsBody', () => {
  it('inclui número do pedido e contacto formatado', () => {
    const body = buildOrderFinishedSmsBody({
      orderNumber: 'DG-2026-0042',
      businessPhone: '923865632',
    });
    expect(body).toContain('DG-2026-0042');
    expect(body).toContain('finalizado');
    expect(body).toContain('+244 923 865 632');
  });

  it('usa o nome do cliente no placeholder {cliente}', () => {
    const body = buildOrderFinishedSmsBody({
      orderNumber: 'DG-2026-0042',
      clientName: 'João Neto',
      messageTemplate:
        '{cliente}, o pedido {pedido} está finalizado e pronto para recolha.{contacto}{rodape}',
    });
    expect(body.startsWith('João Neto,')).toBe(true);
    expect(body).not.toContain('{cliente}');
  });
});
