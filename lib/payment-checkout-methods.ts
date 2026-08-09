import type {
  ClientCheckoutPaymentSettings,
  PaymentMethodValue,
} from "@/lib/api-client";

const CASH: PaymentMethodValue = "CASH_ON_SITE";

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** Método activo no checkout (toggle em Configurações → Pagamentos). */
export function paymentMethodEnabledInCheckout(
  method: PaymentMethodValue,
  settings: ClientCheckoutPaymentSettings | null | undefined,
): boolean {
  if (method === CASH) return true;
  if (!settings) return false;
  switch (method) {
    case "BANK_TRANSFER_SAME":
      return settings.bankTransferSame.enabled !== false;
    case "DEPOSIT":
      return settings.deposit.enabled !== false;
    case "BANK_TRANSFER_EXPRESS":
      return settings.bankTransferExpress.enabled !== false;
    default:
      return false;
  }
}

/** Dados mínimos preenchidos para mostrar instruções e permitir submissão. */
export function paymentMethodHasRequiredData(
  method: PaymentMethodValue,
  settings: ClientCheckoutPaymentSettings | null | undefined,
): boolean {
  if (method === CASH) return true;
  if (!settings) return false;
  switch (method) {
    case "BANK_TRANSFER_SAME":
      return trimmed(settings.bankTransferSame.accountNumber).length > 0;
    case "DEPOSIT":
      return trimmed(settings.deposit.accountNumber).length > 0;
    case "BANK_TRANSFER_EXPRESS":
      return trimmed(settings.bankTransferExpress.expressNumber).length > 0;
    default:
      return false;
  }
}

/** Selecionável no modal (activo pelo admin). */
export function paymentMethodSelectableInCheckout(
  method: PaymentMethodValue,
  settings: ClientCheckoutPaymentSettings | null | undefined,
  settingsLoaded: boolean,
): boolean {
  if (method === CASH) return true;
  if (!settingsLoaded) return true;
  return paymentMethodEnabledInCheckout(method, settings);
}

/** Pronto para submeter (activo + dados mínimos). */
export function paymentMethodReadyForSubmit(
  method: PaymentMethodValue,
  settings: ClientCheckoutPaymentSettings | null | undefined,
  settingsLoaded: boolean,
): boolean {
  if (!settingsLoaded) return false;
  if (!paymentMethodEnabledInCheckout(method, settings)) return false;
  return paymentMethodHasRequiredData(method, settings);
}
