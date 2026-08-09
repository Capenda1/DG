"use client";

import {
  INVOICE_DOCUMENT_MODEL_LABELS,
  INVOICE_DOCUMENT_MODEL_OPTIONS,
  type InvoiceDocumentModel,
} from "@/lib/payment-receipt-pdf";
import type { InvoiceDocumentValidation } from "@/lib/invoice-document-policy";

type InvoiceDocumentPickerProps = {
  id?: string;
  value: InvoiceDocumentModel;
  onChange: (model: InvoiceDocumentModel) => void;
  validation: InvoiceDocumentValidation;
  disabled?: boolean;
  selectClassName?: string;
  compact?: boolean;
};

export function InvoiceDocumentPicker({
  id = "invoice-document-model",
  value,
  onChange,
  validation,
  disabled = false,
  selectClassName = "",
  compact = false,
}: InvoiceDocumentPickerProps) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <label
        htmlFor={id}
        className={
          compact
            ? "block text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
            : "block text-xs font-semibold uppercase tracking-wider text-zinc-400"
        }
      >
        Modelo do documento
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as InvoiceDocumentModel)}
        disabled={disabled}
        className={selectClassName}
      >
        {INVOICE_DOCUMENT_MODEL_OPTIONS.map((k) => (
          <option key={k} value={k}>
            {INVOICE_DOCUMENT_MODEL_LABELS[k]}
          </option>
        ))}
      </select>
      {validation.error ? (
        <p
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200"
          role="alert"
        >
          {validation.error}
        </p>
      ) : null}
      {!validation.error && validation.warning ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
          {validation.warning}
        </p>
      ) : null}
    </div>
  );
}
