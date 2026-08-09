import {
  FACTURA_LIFECYCLE_STAGES,
  lifecycleStageByModel,
  type FacturaLifecycleStageId,
} from "@/lib/facturas-lifecycle";
import type { InvoiceDocumentModel } from "@/lib/payment-receipt-pdf";
import { ROUTES } from "@/lib/routes";

export type FacturaNavSlug = FacturaLifecycleStageId;

/** @deprecated Use FACTURA_LIFECYCLE_STAGES */
export const FACTURA_NAV_ITEMS = FACTURA_LIFECYCLE_STAGES.map((stage) => ({
  slug: stage.id,
  href: stage.href,
  label: stage.shortTitle,
  documentModel: stage.documentModel,
  description: stage.body,
}));

export function facturaNavItemForModel(model: InvoiceDocumentModel) {
  const stage = lifecycleStageByModel(model);
  if (!stage) return undefined;
  return {
    slug: stage.id,
    href: stage.href,
    label: stage.shortTitle,
    documentModel: stage.documentModel,
    description: stage.body,
  };
}

export { ROUTES };
