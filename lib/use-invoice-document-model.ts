"use client";

import { useCallback, useMemo, useState } from "react";
import type { InvoiceDocumentModel } from "@/lib/payment-receipt-pdf";
import {
  type InvoiceDocumentContext,
  suggestInvoiceDocumentModel,
  validateInvoiceDocumentModel,
} from "@/lib/invoice-document-policy";

const MODELS: InvoiceDocumentModel[] = [
  "FACTURA_POR_FORMA",
  "FACTURA_RECIBO",
  "FACTURA",
];

function isInvoiceDocumentModel(v: string): v is InvoiceDocumentModel {
  return (MODELS as string[]).includes(v);
}

/**
 * Estado do modelo de documento com sugestão automática ao mudar pedido/método de pagamento.
 * `preferredModel` (último emitido) tem prioridade ao abrir um pedido.
 */
export function useInvoiceDocumentModel(
  context: InvoiceDocumentContext,
  scopeKey?: string | null,
  preferredModel?: InvoiceDocumentModel | string | null,
) {
  const scopeRevision = scopeKey ?? "";

  const autoModel = useMemo(() => {
    if (preferredModel && isInvoiceDocumentModel(preferredModel)) {
      return preferredModel;
    }
    return suggestInvoiceDocumentModel(context);
  }, [context, preferredModel]);

  const contextKey = useMemo(
    () =>
      [
        context.status ?? "",
        context.paymentMethod ?? "",
        context.orderOrigin ?? "",
      ].join("|"),
    [context.status, context.paymentMethod, context.orderOrigin],
  );

  const [manualModel, setManualModel] = useState<InvoiceDocumentModel | null>(
    null,
  );
  const [manualScope, setManualScope] = useState(scopeRevision);
  const [manualContextKey, setManualContextKey] = useState(contextKey);

  const manualActive =
    manualModel !== null &&
    manualScope === scopeRevision &&
    manualContextKey === contextKey;

  const model = manualActive ? manualModel : autoModel;

  const setModel = useCallback(
    (next: InvoiceDocumentModel) => {
      setManualModel(next);
      setManualScope(scopeRevision);
      setManualContextKey(contextKey);
    },
    [scopeRevision, contextKey],
  );

  const validation = useMemo(
    () => validateInvoiceDocumentModel(context, model),
    [context, model],
  );

  return {
    model,
    setModel,
    validation,
    canIssue: validation.ok,
  };
}
