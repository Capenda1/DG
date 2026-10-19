/** Formatos de papel do comprovante — sem depender do gerador de PDF. */
export type PaymentReceiptPdfFormat =
  | "A4"
  | "A4_BW"
  | "A5_BW"
  | "THERMAL_80"
  | "THERMAL_58"
  | "THERMAL_58_BW";

/** Valor guardado em Configurações (admin). */
export type StoreReceiptPaperFormat = Exclude<
  PaymentReceiptPdfFormat,
  "THERMAL_58"
>;

export const RECEIPT_PDF_FORMAT_LABELS: Record<
  PaymentReceiptPdfFormat,
  string
> = {
  A4: "Folha A4 — texto «Dádiva Go» / total em âmbar; fundos brancos",
  A4_BW:
    "Folha A4 — preto sobre branco (sem cor de marca, só texto e linhas neutras)",
  A5_BW: "Folha A5 — preto sobre branco (sem cinzas nem cor de marca)",
  THERMAL_80: "Rolo térmico 80 mm (Bixolon, Epson…)",
  THERMAL_58: "Rolo térmico 58 mm (estreita)",
  THERMAL_58_BW:
    "Rolo térmico 58 mm — só preto no branco (texto forte, bom contraste térmico)",
};
