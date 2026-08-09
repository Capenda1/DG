import type { jsPDF } from "jspdf";
import type {
  BusinessProfileSettings,
  OrderDetail,
  PaymentMethodValue,
  PaymentSettings,
} from "@/lib/api-client";
import {
  businessLogoDisplayUrl,
  getBusinessProfileSettings,
  getClientCheckoutPaymentSettings,
  getPaymentSettings,
  PAYMENT_METHOD_LABELS,
} from "@/lib/api-client";
import {
  businessProfileToSellerHeader,
  loadReceiptLogoImage,
  paintJsPdfAgtCertification,
  type EmbeddedLogoImage,
} from "@/lib/document-branding";

export { loadReceiptLogoImage };
import { formatMoney, formatMoneyReceiptCell } from "@/lib/format-money";
import { receiptLineDescriptionFromOrderItem } from "@/lib/apparel-catalog";
import { orderStatusLabel } from "@/lib/order-status";
import { receiptShouldIncludeBankDetails, proFormaOmitsOrderStatus } from "@/lib/invoice-document-policy";

type DocWithTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

/** Cor de marca (âmbar) — apenas texto destacado onde aplicável (nunca como fundo). */
const BRAND: [number, number, number] = [184, 124, 32];
const TEXT: [number, number, number] = [35, 35, 38];
const TEXT_MUTED: [number, number, number] = [95, 95, 100];
const LINE: [number, number, number] = [220, 215, 205];
/** Tinta preta absoluta para modos só P&B (ex.: folha A5). */
const BLACK: [number, number, number] = [0, 0, 0];
/** Mensagem ao cliente no rodapé do comprovante (abaixo do aviso sobre factura fiscal). */
const RECEIPT_THANK_YOU_PT =
  "Obrigado pela preferência e volte sempre.";
/**
 * Folga (mm) entre o fim do logótipo e o nome da empresa — igual em retrato (A4/A5)
 * e em térmicas (80 mm = faixa larga, 58 mm = faixa estreita).
 */
const LOGO_TO_COMPANY_NAME_GAP_WIDE_MM = 4.9;
const LOGO_TO_COMPANY_NAME_GAP_NARROW_MM = 4.35;
/** Subir o logótipo ligeiramente no cabeçalho (retrato + térmico). */
const LOGO_NUDGE_TOWARD_TOP_MM = 0.5;

function moneyNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    return parseFloat(v.replace(",", ".")) || 0;
  }
  return Number(v) || 0;
}

/** Modelo que separa pró-forma da factura‑recibo e da factura clássica. */
export type InvoiceDocumentModel =
  | "FACTURA_POR_FORMA"
  | "FACTURA_RECIBO"
  | "FACTURA";

export const DEFAULT_INVOICE_DOCUMENT_MODEL: InvoiceDocumentModel =
  "FACTURA_RECIBO";

export const INVOICE_DOCUMENT_MODEL_LABELS: Record<
  InvoiceDocumentModel,
  string
> = {
  FACTURA_POR_FORMA: "Factura-Pro-Forma",
  FACTURA_RECIBO: "Factura-Recibo",
  FACTURA: "Factura",
};

/** Ordem recomendada em selects UI. */
export const INVOICE_DOCUMENT_MODEL_OPTIONS: InvoiceDocumentModel[] = [
  "FACTURA_POR_FORMA",
  "FACTURA_RECIBO",
  "FACTURA",
];

/** Imagem pré-carregada para `jsPDF.addImage` (sem prefixo `data:`). */
export type ReceiptEmbeddedLogo = EmbeddedLogoImage;

export type PaymentReceiptBuildOptions = {
  /** Valor recebido em numerário (apenas PDV). */
  receivedCash?: number;
  /** Troco (apenas PDV numerário). */
  change?: number;
  /** Nome ou e-mail de quem registou no balcão. */
  attendantLabel?: string;
  /** Emitente no cabeçalho; omitir para preencher em `resolvePaymentReceiptPayload`. */
  sellerHeader?: ReceiptSellerHeader;
  /** Modelo jurídico / de apresentação do PDF — omissão: factura‑recibo. */
  documentModel?: InvoiceDocumentModel;
  /** Número interno (FR-2026-000001) — preenchido após registo na API. */
  documentNumber?: string;
  /** IBAN / titular (só Factura por forma e Factura); preenchido em `resolvePaymentReceiptPayload`. */
  sellerBankFooterLines?: string[];
  /**
   * URL do logótipo (quando `sellerHeader` é passado manualmente e não há `getBusinessProfile`).
   * Omissão: usa `logoUrl` do perfil carregado.
   */
  sellerLogoUrl?: string | null;
  /** Imagem já incorporada — define explicitamente o logótipo do PDF.
   * `null` força ausência de logótipo; `undefined` carrega a partir do perfil / `sellerLogoUrl`.
   */
  receiptLogoImage?: ReceiptEmbeddedLogo | null;
  /** Rodapé AGT; omitir para usar valor do perfil da empresa. */
  agtCertificationLine?: string;
};

/** Dados da empresa no topo do PDF (folha retrato). */
export type ReceiptSellerHeader = {
  title: string;
  companyTagline: string | null;
  detailLines: string[];
};

/** Dados já formatados para renderizar o PDF (permite voltar a imprimir). */
export type PaymentReceiptPdfPayload = {
  sellerHeader: ReceiptSellerHeader;
  orderNumber: string;
  paidAtLabel: string;
  clientName: string;
  clientEmail: string;
  originLabel: string;
  currency: string;
  /** Corpo da tabela: artigo, qtd, unitário, linha */
  tableBody: string[][];
  subtotalFmt: string;
  discountFmt: string;
  totalFmt: string;
  paymentMethodLabel: string;
  receivedFmt: string | null;
  changeFmt: string | null;
  attendantLine: string | null;
  statusLabel: string | null;
  clientPhone: string | null;
  /** Data/hora de recepção (PDV). */
  receptionDateLabel: string | null;
  /** Descrição manual do pedido (`Order.notes`). */
  orderDescription: string | null;
  documentModel: InvoiceDocumentModel;
  /** Número interno sequencial (ex.: FR-2026-000042). */
  documentNumber: string | null;
  /** Transferência mesma instituição — omitido na factura‑recibo. */
  sellerBankFooterLines: string[];
  /** Logótipo da empresa (PNG/JPEG/WebP) incorporado no cabeçalho. */
  receiptLogoImage: ReceiptEmbeddedLogo | null;
  /** Linha de certificação AGT no rodapé. */
  agtCertificationLine: string;
};

const DEFAULT_SELLER_HEADER: ReceiptSellerHeader = {
  title: "Dádiva Go",
  companyTagline: null,
  detailLines: [],
};

export { businessProfileToSellerHeader };

function formatReceptionDateLabel(
  iso: string | null | undefined,
): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString("pt-PT", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

/** Metadados manuais no cabeçalho do bloco «Cliente» (abaixo do título). */
function paintClientBlockHeaderMeta(
  doc: jsPDF,
  x: number,
  y: number,
  maxW: number,
  payload: PaymentReceiptPdfPayload,
  opts: {
    labelFs: number;
    valueFs: number;
    lineDy: number;
    blockGap: number;
    inkMuted: [number, number, number];
    ink: [number, number, number];
  },
): number {
  let cy = y;
  const rows: Array<{ label: string; value: string }> = [];
  if (payload.receptionDateLabel) {
    rows.push({
      label: "Data de recepção",
      value: payload.receptionDateLabel,
    });
  }
  if (payload.orderDescription) {
    rows.push({
      label: "Descrição do pedido",
      value: payload.orderDescription,
    });
  }
  if (rows.length === 0) return cy;

  for (const row of rows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(opts.labelFs);
    doc.setTextColor(...opts.inkMuted);
    doc.text(row.label, x, cy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(opts.valueFs);
    doc.setTextColor(...opts.ink);
    const valueLines = doc.splitTextToSize(row.value, maxW);
    doc.text(valueLines, x, cy + opts.lineDy);
    cy +=
      opts.lineDy +
      valueLines.length * Math.max(opts.valueFs * 0.42, 3.1) +
      opts.blockGap;
  }
  return cy;
}

type PaymentBankSlice = Pick<PaymentSettings, "bankTransferSame">;

/** Uma linha de texto alinhada ao rodapé de comprovante da API (transferência mesma instituição). */
function paymentSettingsToBankReceiptLines(
  pay: PaymentBankSlice | null | undefined,
  establishmentName: string,
): string[] {
  if (!pay?.bankTransferSame) return [];
  const bt = pay.bankTransferSame;
  const bank = bt.bankName?.trim();
  const iban = bt.accountNumber?.trim();
  const titular = bt.accountName?.trim();
  if (!bank && !iban && !titular) return [];
  const parts: string[] = [];
  if (titular) parts.push(titular);
  if (bank) parts.push(bank);
  if (iban) parts.push(`Conta / IBAN: ${iban}`);
  const prefix = establishmentName.trim() || "Dádiva Go";
  return [`${prefix} — ${parts.join(" · ")}`];
}

async function fetchPaymentBankSliceForReceipt(): Promise<PaymentBankSlice | null> {
  try {
    return await getPaymentSettings();
  } catch {
    try {
      return await getClientCheckoutPaymentSettings();
    } catch {
      return null;
    }
  }
}

function receiptLogoDataUrl(img: ReceiptEmbeddedLogo): string {
  const mime =
    img.format === "JPEG"
      ? "image/jpeg"
      : img.format === "WEBP"
        ? "image/webp"
        : "image/png";
  return `data:${mime};base64,${img.base64}`;
}

type PortraitLogoGeom = {
  uri: string;
  format: "PNG" | "JPEG" | "WEBP";
  drawW: number;
  drawH: number;
};

/** Dimensões do logótipo na coluna do emitente — acima do nome da empresa. */
function measurePortraitReceiptLogo(
  doc: jsPDF,
  img: ReceiptEmbeddedLogo | null,
  leftWmm: number,
  widePortraitSheet: boolean,
): PortraitLogoGeom | null {
  if (!img) return null;
  try {
    const uri = receiptLogoDataUrl(img);
    const props = doc.getImageProperties(uri);
    const iw = props.width || 1;
    const ih = props.height || 1;
    const aspect = ih / iw;
    const logoMaxW = Math.min(
      widePortraitSheet ? 48 : 42,
      Math.max(18, leftWmm - 2),
    );
    const logoMaxH = widePortraitSheet ? 16 : 13.5;
    if (logoMaxW < 10) return null;
    let drawW = logoMaxW;
    let drawH = drawW * aspect;
    if (drawH > logoMaxH) {
      drawH = logoMaxH;
      drawW = drawH / aspect;
    }
    return { uri, format: img.format, drawW, drawH };
  } catch {
    return null;
  }
}

/** Logótipo no canto superior esquerdo nos rolos 80 / 58 mm; abaixo, pequeno intervalo até ao nome da empresa. */
function paintReceiptLogoThermalTop(
  doc: jsPDF,
  img: ReceiptEmbeddedLogo | null,
  pageW: number,
  margin: number,
  yTop: number,
  narrow58: boolean,
): number {
  if (!img) return yTop;
  try {
    const uri = receiptLogoDataUrl(img);
    const props = doc.getImageProperties(uri);
    const iw = props.width || 1;
    const ih = props.height || 1;
    const aspect = ih / iw;
    const inner = pageW - 2 * margin;
    const maxW = narrow58
      ? Math.min(inner * 0.46, 21)
      : Math.min(inner * 0.36, 28);
    const maxH = narrow58 ? 8 : 10;
    let drawW = maxW;
    let drawH = drawW * aspect;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH / aspect;
    }
    /* Canto superior esquerdo, alinhado à margem de impressão. */
    const xImg = margin;
    const yImg = Math.max(margin + 0.38, yTop - LOGO_NUDGE_TOWARD_TOP_MM);
    doc.addImage(uri, img.format, xImg, yImg, drawW, drawH);
    const gapNome = narrow58
      ? LOGO_TO_COMPANY_NAME_GAP_NARROW_MM
      : LOGO_TO_COMPANY_NAME_GAP_WIDE_MM;
    return yImg + drawH + gapNome;
  } catch {
    return yTop;
  }
}

/** Carrega emitente + rodapé da API e devolve payload pronto para o PDF. */
export async function resolvePaymentReceiptPayload(
  order: OrderDetail,
  opts?: PaymentReceiptBuildOptions,
): Promise<PaymentReceiptPdfPayload> {
  const documentModel =
    opts?.documentModel ?? DEFAULT_INVOICE_DOCUMENT_MODEL;
  const pm = order.paymentMethod as PaymentMethodValue | null | undefined;
  const profile =
    opts?.sellerHeader != null
      ? null
      : await getBusinessProfileSettings().catch(() => null);
  const sellerHeader =
    opts?.sellerHeader ?? businessProfileToSellerHeader(profile);
  const tradeName =
    opts?.sellerHeader?.title?.trim() ||
    profile?.companyName?.trim() ||
    "Dádiva Go";

  let sellerBankFooterLines = opts?.sellerBankFooterLines ?? [];
  if (
    receiptShouldIncludeBankDetails(documentModel, pm) &&
    opts?.sellerBankFooterLines === undefined
  ) {
    const pay = await fetchPaymentBankSliceForReceipt();
    sellerBankFooterLines = paymentSettingsToBankReceiptLines(pay, tradeName);
  }

  let receiptLogoImage: ReceiptEmbeddedLogo | null;
  if (opts?.receiptLogoImage !== undefined) {
    receiptLogoImage = opts.receiptLogoImage;
  } else if (opts?.sellerLogoUrl !== undefined) {
    receiptLogoImage = await loadReceiptLogoImage(opts.sellerLogoUrl || null);
  } else {
    let logoSrc = profile?.logoUrl?.trim();
    if (!logoSrc && opts?.sellerHeader) {
      const pLogo = await getBusinessProfileSettings().catch(() => null);
      logoSrc = pLogo?.logoUrl?.trim() ?? "";
    }
    receiptLogoImage = await loadReceiptLogoImage(logoSrc || null);
  }

  return buildPaymentReceiptFromOrderDetail(order, {
    ...opts,
    sellerHeader,
    sellerBankFooterLines,
    receiptLogoImage,
    documentNumber: opts?.documentNumber ?? undefined,
    agtCertificationLine:
      opts?.agtCertificationLine ?? profile?.agtCertificationLine?.trim() ?? "",
  });
}

export function buildPaymentReceiptFromOrderDetail(
  order: OrderDetail,
  opts?: PaymentReceiptBuildOptions,
): PaymentReceiptPdfPayload {
  const currency = (order.currency ?? "AOA").toUpperCase();
  let gross = 0;
  const tableBody: string[][] = order.items.map((it) => {
    const up = moneyNum(it.unitPrice);
    const lineTotal = Math.round(up * it.quantity * 100) / 100;
    gross += lineTotal;
    const articleLabel = receiptLineDescriptionFromOrderItem(
      it.productName,
      it.metadata ?? null,
    );
    return [
      articleLabel,
      String(it.quantity),
      formatMoneyReceiptCell(up, currency),
      formatMoneyReceiptCell(lineTotal, currency),
    ];
  });
  gross = Math.round(gross * 100) / 100;
  const disc = Math.round(moneyNum(order.discountAmount) * 100) / 100;
  const total = Math.round(moneyNum(order.totalAmount) * 100) / 100;

  const pm = order.paymentMethod as PaymentMethodValue | null | undefined;
  const paymentMethodLabel = pm
    ? (PAYMENT_METHOD_LABELS[pm] ?? String(pm))
    : "—";

  const documentModel =
    opts?.documentModel ?? DEFAULT_INVOICE_DOCUMENT_MODEL;

  const orderStatus = (order.status ?? "DRAFT").toUpperCase();
  const proFormaPreSubmit =
    documentModel === "FACTURA_POR_FORMA" &&
    proFormaOmitsOrderStatus(orderStatus);

  const referenceInstant = proFormaPreSubmit
    ? new Date()
    : new Date(order.updatedAt);
  const paidAtLabel = Number.isFinite(referenceInstant.getTime())
    ? (proFormaPreSubmit ? "Emitido: " : "") +
      referenceInstant.toLocaleString("pt-PT", {
        dateStyle: "full",
        timeStyle: "short",
      })
    : order.updatedAt;

  const originLabel =
    order.orderOrigin === "BALCAO"
      ? "Balcão (PDV)"
      : order.orderOrigin === "ONLINE"
        ? "Online"
        : "—";

  let receivedFmt: string | null = null;
  let changeFmt: string | null = null;
  if (
    pm === "PDV_CASH" &&
    opts?.receivedCash !== undefined &&
    Number.isFinite(opts.receivedCash)
  ) {
    receivedFmt = formatMoney(opts.receivedCash, currency);
    if (
      opts.change !== undefined &&
      Number.isFinite(opts.change) &&
      opts.change > 0
    ) {
      changeFmt = formatMoney(opts.change, currency);
    }
  }

  const attendantFromOrder = order.attendant?.name?.trim();
  const attendantLine =
    (opts?.attendantLabel && opts.attendantLabel.trim()) ||
    attendantFromOrder ||
    null;

  const phoneRaw = order.client?.phone;
  const clientPhone =
    typeof phoneRaw === "string" && phoneRaw.trim().length > 0
      ? phoneRaw.trim()
      : null;

  const sellerHeader =
    opts?.sellerHeader ?? { ...DEFAULT_SELLER_HEADER };

  const statusLabel = proFormaPreSubmit
    ? null
    : orderStatusLabel(order.status ?? "");

  return {
    sellerHeader,
    documentModel,
    documentNumber: opts?.documentNumber?.trim() || null,
    orderNumber: order.orderNumber,
    paidAtLabel,
    clientName: order.client?.name ?? "—",
    clientEmail: order.client?.email ?? "—",
    originLabel,
    currency,
    tableBody,
    subtotalFmt: formatMoney(gross, currency),
    discountFmt: formatMoney(disc, currency),
    totalFmt: formatMoney(total, currency),
    paymentMethodLabel,
    receivedFmt,
    changeFmt,
    attendantLine,
    statusLabel,
    clientPhone,
    receptionDateLabel: formatReceptionDateLabel(order.receptionDate ?? null),
    orderDescription: order.notes?.trim() ? order.notes.trim() : null,
    sellerBankFooterLines: opts?.sellerBankFooterLines ?? [],
    receiptLogoImage: opts?.receiptLogoImage ?? null,
    agtCertificationLine: opts?.agtCertificationLine?.trim() ?? "",
  };
}

function invoiceTotalsSectionHeading(
  model: InvoiceDocumentModel,
  portraitSheet: boolean,
): string {
  if (model === "FACTURA_POR_FORMA") return "Totais";
  if (model === "FACTURA")
    return portraitSheet ? "Totais e liquidação" : "Totais";
  return portraitSheet ? "Resumo de pagamento" : "Resumo";
}

function invoiceLegalFooterLine(
  model: InvoiceDocumentModel,
  portraitSheet: boolean,
): string {
  if (model === "FACTURA_POR_FORMA") {
    return portraitSheet
      ? "Factura por forma — documento provisional e informativo; não substitui factura até emissão definitiva nem comprova IVA cobrado."
      : "Por forma — sem valor fiscal.";
  }
  if (model === "FACTURA_RECIBO") {
    return portraitSheet
      ? "Factura-recibo: cobrança da venda nos termos legais aplicáveis."
      : "Fact.-recibo nos termos aplicáveis.";
  }
  return portraitSheet
    ? "Factura de cobrança; conserve para arquivo e apoio à contabilização."
    : "Factura nos termos aplicáveis.";
}

/** Nome sugerido para PDF (compatível com a maioria dos sistemas). */
export function receiptPdfFilename(
  orderNumber: string,
  model: InvoiceDocumentModel,
): string {
  const safe = orderNumber.replace(/[^\w\-]+/g, "_").slice(0, 80);
  const prefix =
    model === "FACTURA_POR_FORMA"
      ? "factura-por-forma"
      : model === "FACTURA_RECIBO"
        ? "factura-recibo"
        : "factura";
  return `${prefix}-${safe || "dadiva"}.pdf`;
}

function buildReceiptTotalsBody(
  payload: PaymentReceiptPdfPayload,
  portraitSheet: boolean,
  narrowThermal58: boolean,
): string[][] {
  const m = payload.documentModel;

  const subLbl = portraitSheet
    ? "Subtotal (bruto)"
    : narrowThermal58
      ? "Subtotal"
      : "Subtotal (bruto)";
  const dscLbl = portraitSheet
    ? "Desconto"
    : narrowThermal58
      ? "Desc."
      : "Desconto";
  const pmLong = payload.paymentMethodLabel;
  const pmShort = payload.paymentMethodLabel.slice(0, 48);

  if (m === "FACTURA_POR_FORMA") {
    const totalLbl = portraitSheet
      ? "Total (por forma)"
      : narrowThermal58
        ? "Total"
        : "Total (por forma)";
    return [
      [subLbl, payload.subtotalFmt],
      [dscLbl, payload.discountFmt],
      [totalLbl, payload.totalFmt],
    ];
  }

  if (m === "FACTURA") {
    const liqLbl = portraitSheet
      ? "Liquidação"
      : narrowThermal58
        ? "Liq."
        : "Liquidação";
    const payVal = portraitSheet ? pmLong : narrowThermal58 ? pmShort : pmLong;
    return [
      [subLbl, payload.subtotalFmt],
      [dscLbl, payload.discountFmt],
      ["Total", payload.totalFmt],
      [liqLbl, payVal],
    ];
  }

  /* FACTURA_RECIBO */
  return portraitSheet
    ? [
        [subLbl, payload.subtotalFmt],
        [dscLbl, payload.discountFmt],
        ["Total pago", payload.totalFmt],
        ["Método de pagamento", pmLong],
        ...(payload.receivedFmt
          ? ([
              ["Valor recebido (numerário)", payload.receivedFmt],
            ] as string[][])
          : []),
        ...(payload.changeFmt
          ? ([["Troco", payload.changeFmt]] as string[][])
          : []),
      ]
    : narrowThermal58
      ? [
          [subLbl, payload.subtotalFmt],
          [dscLbl, payload.discountFmt],
          ["Total", payload.totalFmt],
          ["Pagamento", pmShort],
          ...(payload.receivedFmt
            ? ([["Recebido", payload.receivedFmt]] as string[][])
            : []),
          ...(payload.changeFmt
            ? ([["Troco", payload.changeFmt]] as string[][])
            : []),
        ]
      : [
          [subLbl, payload.subtotalFmt],
          [dscLbl, payload.discountFmt],
          ["Total pago", payload.totalFmt],
          ["Método", pmLong],
          ...(payload.receivedFmt
            ? ([["Valor recebido", payload.receivedFmt]] as string[][])
            : []),
          ...(payload.changeFmt
            ? ([["Troco", payload.changeFmt]] as string[][])
            : []),
        ];
}

/** Layout do PDF — A4 com/sem marca; A5 P&B; térmicas 80 mm e 58 mm (58 com variante P&B forte). */
export type PaymentReceiptPdfFormat =
  | "A4"
  | "A4_BW"
  | "A5_BW"
  | "THERMAL_80"
  | "THERMAL_58"
  | "THERMAL_58_BW";

/** Valor guardado em Configurações (admin) pela API. */
export type StoreReceiptPaperFormat = PaymentSettings["receiptPaperFormat"];

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

/** Ordens recomendadas no painel de configurações. */
export const STORE_RECEIPT_PAPER_FORMAT_ORDER: StoreReceiptPaperFormat[] = [
  "THERMAL_80",
  "THERMAL_58_BW",
  "A5_BW",
  "A4_BW",
  "A4",
];

/**
 * Pro-forma e factura clássica usam sempre folha A4 (ignora rolo térmico das configurações).
 */
export function invoiceDocumentUsesA4Sheet(
  model: InvoiceDocumentModel,
): boolean {
  return model === "FACTURA_POR_FORMA" || model === "FACTURA";
}

function coerceStoreFormatToA4(
  fmt: PaymentReceiptPdfFormat,
): PaymentReceiptPdfFormat {
  if (fmt === "A4_BW") return "A4_BW";
  return "A4";
}

/**
 * Resolve o formato do comprovante: configurações da loja via API (`receiptPaperFormat`),
 * ou `explicit` se fornecido (testes / chamadas pontuais).
 * Pro-forma e factura clássica ficam sempre em A4.
 */
export async function resolveReceiptPdfFormat(
  explicit?: PaymentReceiptPdfFormat,
  documentModel?: InvoiceDocumentModel,
): Promise<PaymentReceiptPdfFormat> {
  if (explicit === "THERMAL_58") {
    return invoiceDocumentUsesA4Sheet(documentModel ?? "FACTURA_RECIBO")
      ? "A4"
      : "THERMAL_58";
  }
  if (explicit === "THERMAL_58_BW") {
    return invoiceDocumentUsesA4Sheet(documentModel ?? "FACTURA_RECIBO")
      ? "A4"
      : "THERMAL_58_BW";
  }
  if (
    explicit === "A4" ||
    explicit === "A4_BW" ||
    explicit === "A5_BW" ||
    explicit === "THERMAL_80"
  ) {
    return invoiceDocumentUsesA4Sheet(documentModel ?? "FACTURA_RECIBO")
      ? coerceStoreFormatToA4(explicit)
      : explicit;
  }
  try {
    const s = await getPaymentSettings();
    let fmt: PaymentReceiptPdfFormat = "THERMAL_80";
    if (s.receiptPaperFormat === "A4") fmt = "A4";
    else if (s.receiptPaperFormat === "A4_BW") fmt = "A4_BW";
    else if (s.receiptPaperFormat === "A5_BW") fmt = "A5_BW";
    else if (s.receiptPaperFormat === "THERMAL_58_BW") fmt = "THERMAL_58_BW";
    if (documentModel && invoiceDocumentUsesA4Sheet(documentModel)) {
      return coerceStoreFormatToA4(fmt);
    }
    return fmt;
  } catch {
    return documentModel && invoiceDocumentUsesA4Sheet(documentModel)
      ? "A4"
      : "THERMAL_80";
  }
}

/** Linhas para comprovante térmico B&W — pretas definidas ajudam Bixolon e similares. */
const THERM_BW_LINE: [number, number, number] = [0, 0, 0];

function hr(
  doc: jsPDF,
  y: number,
  margin: number,
  pageW: number,
  inset = 0,
  lineW = 0.25,
  gapAfter = 4,
  drawRgb?: [number, number, number],
): number {
  doc.setDrawColor(...(drawRgb ?? LINE));
  doc.setLineWidth(lineW);
  doc.line(margin + inset, y, pageW - margin - inset, y);
  return y + gapAfter;
}

function sectionTitle(
  doc: jsPDF,
  margin: number,
  y: number,
  title: string,
  fs = 7.5,
  gapAfter = 4,
  colors?: { title: [number, number, number]; body: [number, number, number] },
): number {
  const titleC = colors?.title ?? TEXT_MUTED;
  const bodyC = colors?.body ?? TEXT;
  doc.setFontSize(fs);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...titleC);
  doc.text(title.toUpperCase(), margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...bodyC);
  return y + gapAfter;
}

/** Secção em folhas A4/A5 — título destacado + traço sob a cor da marca ou neutro. */
function portraitSectionHeading(
  doc: jsPDF,
  margin: number,
  y: number,
  title: string,
  fs: number,
  brandColor: boolean,
  muted: [number, number, number],
  ink: [number, number, number],
  wide: boolean,
): number {
  const gap = wide ? 0.45 : 0.35;
  doc.setFontSize(fs + gap);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(brandColor ? BRAND : muted));
  const t = title.toUpperCase();
  doc.text(t, margin, y);
  const tw = doc.getTextWidth(t);
  const ruleY = y + 2.35;
  const ruleW = Math.min(tw + 16, wide ? 108 : 86);
  doc.setDrawColor(...(brandColor ? BRAND : ink));
  doc.setLineWidth(brandColor ? 0.48 : 0.3);
  doc.line(margin, ruleY, margin + ruleW, ruleY);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...ink);
  return y + (wide ? 7.1 : 6.35);
}

function drawPortraitDocTypeBadge(
  doc: jsPDF,
  x: number,
  yTop: number,
  shortLabel: string,
  maxW: number,
  brandColor: boolean,
  pureMono: boolean,
  ink: [number, number, number],
): number {
  const fs = widePortraitInnerFs(maxW);
  doc.setFontSize(fs);
  doc.setFont("helvetica", "bold");
  const padX = 4;
  const padY = 2.65;
  const lines = doc.splitTextToSize(shortLabel, maxW - 2 * padX - 2);
  const lh = fs * 0.38 + 3.05;
  const innerW =
    Math.max(...lines.map((ln: string) => doc.getTextWidth(ln)), fs * 1.9) +
    padX *
      2;
  const boxW = Math.min(innerW, maxW);
  const boxH = lines.length * lh + padY * 2;

  const fill: [number, number, number] =
    pureMono || !brandColor ? [248, 248, 251] : [255, 244, 225];
  const stroke: [number, number, number] =
    pureMono || !brandColor ? [52, 52, 58] : BRAND;

  doc.setFillColor(...fill);
  doc.setDrawColor(...stroke);
  doc.setLineWidth(pureMono || !brandColor ? 0.15 : 0.26);
  doc.roundedRect(x, yTop, boxW, boxH, 2.1, 2.1, "FD");

  doc.setTextColor(...(pureMono || !brandColor ? ink : BRAND));
  let ty = yTop + padY + fs * 0.37;
  for (const ln of lines) {
    doc.text(ln, x + padX, ty);
    ty += lh;
  }
  doc.setFont("helvetica", "normal");
  return yTop + boxH + 2.9;
}

function widePortraitInnerFs(maxWidthMm: number): number {
  if (maxWidthMm >= 118) return 9.1;
  if (maxWidthMm >= 90) return 8.65;
  return 8.2;
}

/** Faixa superior em folha retrato (identidade visível à primeira vista). */
function paintPortraitTopStrip(
  doc: jsPDF,
  margin: number,
  pageW: number,
  y: number,
  brandColor: boolean,
  pureMono: boolean,
): number {
  const barH = brandColor && !pureMono ? 3.4 : 2.9;
  if (brandColor && !pureMono) {
    doc.setFillColor(...BRAND);
    doc.rect(margin, y, pageW - 2 * margin, barH, "F");
  } else {
    doc.setFillColor(30, 30, 34);
    doc.rect(margin, y, pageW - 2 * margin, barH, "F");
  }
  return y + barH + 5.2;
}

function labelValue(
  doc: jsPDF,
  margin: number,
  y: number,
  label: string,
  value: string,
  blockWidth: number,
  opts?: {
    fs?: number;
    lineDy?: number;
    bottomGap?: number;
    labelColor?: [number, number, number];
    valueColor?: [number, number, number];
  },
) {
  const fs = opts?.fs ?? 8.5;
  const lineDy = opts?.lineDy ?? 3.9;
  const bottomGap = opts?.bottomGap ?? 4.5;
  const lc = opts?.labelColor ?? TEXT_MUTED;
  const vc = opts?.valueColor ?? TEXT;
  doc.setFontSize(fs);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...lc);
  doc.text(label, margin, y);
  const labelW = doc.getTextWidth(`${label} `);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...vc);
  const valueW = Math.max(14, blockWidth - labelW);
  const lines = doc.splitTextToSize(
    value && value.trim() !== "" ? value : "—",
    valueW,
  );
  const L = lines.length ? lines : ["—"];
  doc.text(L[0], margin + labelW, y);
  let yy = y;
  for (let i = 1; i < L.length; i++) {
    yy += lineDy;
    doc.text(L[i], margin + labelW, yy);
  }
  return yy + bottomGap;
}

/** Altura inicial (teto) do PDF em térmicas: depois é recortada ao conteúdo real (`trimThermalReceiptPageMm`). */
const THERMAL_ROLL_HEIGHT_MM = 2400;
/** Margem em branco após o texto do rodapé (milímetro de papel físico antes do corte). */
const THERMAL_RECEIPT_TAIL_PAD_MM = 10;
/** Folga extra na altura do PDF final térmico: se for curta demais o AutoTable salta para nova página e pode ficar página 1 vazia na impressão / pré-visualização. */
const THERMAL_PAGE_HEIGHT_SLACK_MM = 28;

type ReceiptLayoutCtx = {
  /** Folha retrato A4 ou A5 (vs rolo térmico). */
  portraitSheet: boolean;
  /** Em A4, “Dádiva Go” e coluna Total em âmbar — sem blocos nem faixas a cor de fundo. */
  brandColor: boolean;
  /** Texto e traços em preto puro; sem cinzas de “muted” (folha A5 P&B ou rolo 58 mm P&B). */
  pureMonochromeBlack: boolean;
  pageWmm: number;
  margin: number;
  stripeH: number;
  titleFs: number;
  subTitleFs: number;
  dividerW: number;
  headerBadgeH: number;
  badgeRounding: number;
  orderLblFs: number;
  orderNumFs: number;
  metaFs: number;
  sectionFs: number;
  lvFs: number;
  lvLineDy: number;
  lvBottom: number;
  tableHead: string[];
  tableFs: number;
  tablePad: { top: number; bottom: number; left: number; right: number };
  colWidths: [number, number, number, number];
  totalsLabelW: number;
  totalsValW: number;
  totalsFs: number;
  totalsTotalFs: number;
  attendantFs: number;
  attendantTitleFs: number;
  contactFs: number;
  contactLineMm: number;
  footFs: number;
  footInset: number;
  hrInset: number;
};

/** Rolo físico ~58 mm — `pureMonochromeBlack` activa apenas contraste forte (sem cinzas). */
function layoutThermalRoll58mm(pureMonochromeBlack: boolean): ReceiptLayoutCtx {
  return {
    portraitSheet: false,
    brandColor: false,
    pureMonochromeBlack,
    pageWmm: 58,
    margin: 3,
    stripeH: 3.6,
    titleFs: 9.8,
    subTitleFs: 6.4,
    dividerW: 0.22,
    headerBadgeH: 11,
    badgeRounding: 0,
    orderLblFs: 6,
    orderNumFs: 9,
    metaFs: 5.9,
    sectionFs: 6.1,
    lvFs: 6.2,
    lvLineDy: 2.95,
    lvBottom: 3.55,
    tableHead: ["Art.", "Q", "P.u.", "Tot"],
    tableFs: 6.2,
    tablePad: { top: 1, bottom: 1, left: 0.55, right: 0.55 },
    /** ~58 mm − 2×margem − folga (~3 mm para grelha/padding AutoTable): evita overflow silencioso. */
    colWidths: [22, 6, 9.5, 10.5],
    totalsLabelW: 30,
    totalsValW: 17,
    totalsFs: 6.35,
    totalsTotalFs: 7,
    attendantFs: 6.35,
    attendantTitleFs: 6.35,
    contactFs: 6.35,
    contactLineMm: 3.05,
    footFs: 5.75,
    footInset: 1,
    hrInset: 0,
  };
}

function receiptLayout(fmt: PaymentReceiptPdfFormat): ReceiptLayoutCtx {
  if (fmt === "A4") {
    return {
      portraitSheet: true,
      brandColor: true,
      pureMonochromeBlack: false,
      pageWmm: 210,
      margin: 16,
      stripeH: 5,
      titleFs: 15,
      subTitleFs: 10,
      dividerW: 0.35,
      headerBadgeH: 16,
      badgeRounding: 2,
      orderLblFs: 9,
      orderNumFs: 12,
      metaFs: 8,
      sectionFs: 7.5,
      lvFs: 8.5,
      lvLineDy: 3.9,
      lvBottom: 4.5,
      tableHead: ["Artigo", "Qtd", "P. unit.", "Total"],
      tableFs: 8.2,
      tablePad: { top: 2, bottom: 2, left: 1.8, right: 1.8 },
      colWidths: [78, 14, 36, 36],
      totalsLabelW: 108,
      totalsValW: 74,
      totalsFs: 9,
      totalsTotalFs: 10,
      attendantFs: 8,
      attendantTitleFs: 8,
      contactFs: 8.3,
      contactLineMm: 4,
      footFs: 7.5,
      footInset: 8,
      hrInset: 0,
    };
  }
  if (fmt === "A4_BW") {
    return {
      portraitSheet: true,
      brandColor: false,
      pureMonochromeBlack: false,
      pageWmm: 210,
      margin: 16,
      stripeH: 5,
      titleFs: 15,
      subTitleFs: 10,
      dividerW: 0.35,
      headerBadgeH: 18.5,
      badgeRounding: 2,
      orderLblFs: 9,
      orderNumFs: 12,
      metaFs: 8,
      sectionFs: 7.5,
      lvFs: 8.5,
      lvLineDy: 3.9,
      lvBottom: 4.5,
      tableHead: ["Artigo", "Qtd", "P. unit.", "Total"],
      tableFs: 8.2,
      tablePad: { top: 2.2, bottom: 2.2, left: 1.95, right: 1.95 },
      colWidths: [78, 14, 36, 36],
      totalsLabelW: 108,
      totalsValW: 74,
      totalsFs: 9,
      totalsTotalFs: 10,
      attendantFs: 8,
      attendantTitleFs: 8,
      contactFs: 8.3,
      contactLineMm: 4,
      footFs: 7.5,
      footInset: 8,
      hrInset: 0,
    };
  }
  if (fmt === "A5_BW") {
    return {
      portraitSheet: true,
      brandColor: false,
      pureMonochromeBlack: true,
      pageWmm: 148,
      margin: 11,
      stripeH: 5,
      titleFs: 13,
      subTitleFs: 8.5,
      dividerW: 0.32,
      headerBadgeH: 15,
      badgeRounding: 1.75,
      orderLblFs: 8,
      orderNumFs: 10.5,
      metaFs: 7,
      sectionFs: 7,
      lvFs: 7.85,
      lvLineDy: 3.6,
      lvBottom: 4.1,
      tableHead: ["Artigo", "Qtd", "P. unit.", "Total"],
      tableFs: 7.5,
      tablePad: { top: 1.75, bottom: 1.75, left: 1.5, right: 1.5 },
      colWidths: [52, 12, 30, 32],
      totalsLabelW: 78,
      totalsValW: 38,
      totalsFs: 8.2,
      totalsTotalFs: 9,
      attendantFs: 7.35,
      attendantTitleFs: 7.35,
      contactFs: 7.5,
      contactLineMm: 3.65,
      footFs: 6.9,
      footInset: 6,
      hrInset: 0,
    };
  }
  if (fmt === "THERMAL_80") {
    return {
      portraitSheet: false,
      brandColor: false,
      pureMonochromeBlack: false,
      pageWmm: 80,
      margin: 5,
      stripeH: 4,
      titleFs: 11,
      subTitleFs: 7,
      dividerW: 0.28,
      headerBadgeH: 18,
      badgeRounding: 1.2,
      orderLblFs: 7,
      orderNumFs: 10,
      metaFs: 6.3,
      sectionFs: 6.8,
      lvFs: 7,
      lvLineDy: 3.35,
      lvBottom: 3.9,
      tableHead: ["Artigo", "Qtd", "P.u.", "Tot."],
      tableFs: 6.9,
      tablePad: { top: 1.2, bottom: 1.2, left: 1, right: 1 },
      colWidths: [37, 7, 12, 14],
      totalsLabelW: 44,
      totalsValW: 26,
      totalsFs: 7,
      totalsTotalFs: 7.9,
      attendantFs: 6.9,
      attendantTitleFs: 6.9,
      contactFs: 6.8,
      contactLineMm: 3.35,
      footFs: 6.15,
      footInset: 2,
      hrInset: 0,
    };
  }
  if (fmt === "THERMAL_58_BW") return layoutThermalRoll58mm(true);
  return layoutThermalRoll58mm(false);
}

/** Larguras da grelha «Artigos» — térmica calculada pela página útil. */
function resolveReceiptTableColWidths(
  L: ReceiptLayoutCtx,
): [number, number, number, number] {
  if (L.portraitSheet) return L.colWidths;
  const contentW = L.pageWmm - 2 * L.margin;
  const narrow = L.pageWmm <= 60;
  const qtdW = narrow ? 6 : 8;
  const moneyW = Math.max(
    narrow ? 10 : 11.5,
    Math.min(narrow ? 11.5 : 13.5, (contentW - (narrow ? 24 : 30)) * 0.24),
  );
  const artW = Math.max(narrow ? 22 : 34, contentW - qtdW - 2 * moneyW);
  return [artW, qtdW, moneyW, moneyW];
}

export type OpenReceiptPrintOptions = {
  /**
   * Força formato concreto. Omitido → lê `receiptPaperFormat` nas Configurações (API).
   */
  format?: PaymentReceiptPdfFormat;
  /**
   * Força o fluxo de impressão em iframe (desktop), ignorando o caminho móvel.
   * Útil para testes ou tablets em modo “desktop”.
   */
  forceDesktopPrint?: boolean;
};

/** Heurística: telemóveis / viewport estreita onde `print()` em iframe costuma falhar. */
export function isCoarseMobileOrNarrowViewport(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false;
  const ua = navigator.userAgent || "";
  const uaMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const narrow = window.matchMedia?.("(max-width: 640px)")?.matches ?? false;
  return uaMobile || narrow;
}


function triggerPdfBlobDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(href);
    } catch {
      /* */
    }
  }, 60_000);
}

/**
 * Gera o PDF do comprovante como `Blob` (útil para partilhar ou guardar no telemóvel).
 */
export async function buildPaymentReceiptPdfBlob(
  payload: PaymentReceiptPdfPayload,
  format?: PaymentReceiptPdfFormat,
): Promise<Blob> {
  const fmt = await resolveReceiptPdfFormat(format, payload.documentModel);
  const doc = await renderPaymentReceiptDoc(payload, fmt);
  return doc.output("blob");
}

/**
 * Descarrega o PDF (funciona bem em telemóveis quando o diálogo de impressão não existe).
 */
export async function downloadPaymentReceiptPdf(
  payload: PaymentReceiptPdfPayload,
  options?: OpenReceiptPrintOptions,
): Promise<void> {
  const blob = await buildPaymentReceiptPdfBlob(payload, options?.format);
  triggerPdfBlobDownload(
    blob,
    receiptPdfFilename(payload.orderNumber, payload.documentModel),
  );
}

export type SharePaymentReceiptResult =
  | "shared"
  | "unsupported"
  | "cannot_share"
  | "user_cancelled";

/**
 * Partilha o PDF via API nativa (iOS/Android), quando o browser suporta `canShare` com ficheiros.
 */
export async function sharePaymentReceiptPdf(
  payload: PaymentReceiptPdfPayload,
  options?: OpenReceiptPrintOptions,
): Promise<SharePaymentReceiptResult> {
  if (typeof navigator === "undefined" || !navigator.share) {
    return "unsupported";
  }
  const blob = await buildPaymentReceiptPdfBlob(payload, options?.format);
  const name = receiptPdfFilename(payload.orderNumber, payload.documentModel);
  const file = new File([blob], name, { type: "application/pdf" });
  const sellerTitle =
    payload.sellerHeader.title.trim() || DEFAULT_SELLER_HEADER.title;
  const shareData: ShareData = {
    title: `${INVOICE_DOCUMENT_MODEL_LABELS[payload.documentModel]} — ${sellerTitle}`,
    text: `Pedido ${payload.orderNumber}`,
    files: [file],
  };
  if (!navigator.canShare?.(shareData)) {
    return "unsupported";
  }
  try {
    await navigator.share(shareData);
    return "shared";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return "user_cancelled";
    }
    return "cannot_share";
  }
}

async function renderPaymentReceiptDoc(
  payload: PaymentReceiptPdfPayload,
  format: PaymentReceiptPdfFormat,
): Promise<jsPDF> {
  const [{ jsPDF }, autoTableImport] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const at =
    typeof autoTableImport.autoTable === "function"
      ? autoTableImport.autoTable
      : autoTableImport.default;

  const L = receiptLayout(format);
  /** Rolo 58 mm compacto — layout de rótulos e totais igual para variações 58 mm. */
  const narrowThermal58 = format === "THERMAL_58" || format === "THERMAL_58_BW";
  /** Rolo térmico (80 / 58 mm) — linhas bem pretas para Bixolon; folhas mantêm peso próprio de laser. */
  const thermalRoll = !L.portraitSheet;
  /** A4 retrato (~210 mm) — ritmo igual entre A4 com marca e A4 só preto/branco (evita texto “compacto demais”). */
  const widePortraitSheet = L.portraitSheet && L.pageWmm >= 200;

  const ink: [number, number, number] = L.pureMonochromeBlack ? BLACK : TEXT;
  const inkMuted: [number, number, number] = L.pureMonochromeBlack
    ? BLACK
    : TEXT_MUTED;
  const secColors = { title: inkMuted, body: ink };
  const sheetLineRgb: [number, number, number] = thermalRoll
    ? THERM_BW_LINE
    : L.pureMonochromeBlack
      ? BLACK
      : LINE;
  const lineDraw = sheetLineRgb;
  const tableLineRgb = sheetLineRgb;

  /** Data mais compacta nos rolos (rótulos longos em pt‑PT ocupam menos altura ao dividir linhas). */
  const paidAtDisplayed = L.portraitSheet
    ? payload.paidAtLabel
    : payload.paidAtLabel.length <= 96
      ? payload.paidAtLabel
      : `${payload.paidAtLabel.slice(0, 93)}…`;

  const lvOpts = {
    fs: L.lvFs,
    lineDy: L.lvLineDy,
    bottomGap: L.lvBottom,
    ...(L.pureMonochromeBlack ? { labelColor: BLACK, valueColor: BLACK } : {}),
  };

  /**
   * Em rolos térmicos medimos primeiro a altura do conteúdo e só depois criamos o PDF final
   * com esse comprimento — ver comentário no fim da função. Reduzir a altura da página **após**
   * desenhar quebra as coordenadas Y do jsPDF (modo compat) e faz o PDF ficar inteiro branco ao imprimir.
   */
  let thermalExtentBottomMm = 0;
  const bumpThermalMm = thermalRoll
    ? (bottomY: number) => {
        if (Number.isFinite(bottomY))
          thermalExtentBottomMm = Math.max(thermalExtentBottomMm, bottomY);
      }
    : () => {};

  function paintOnto(doc: jsPDF): void {
    thermalExtentBottomMm = 0;
    const pageW = doc.internal.pageSize.getWidth();
    const margin = L.margin;

    const portraitHead = (yy: number, label: string, fs = L.sectionFs) =>
      L.portraitSheet
        ? portraitSectionHeading(
            doc,
            margin,
            yy,
            label,
            fs,
            L.brandColor && !L.pureMonochromeBlack,
            inkMuted,
            ink,
            widePortraitSheet,
          )
        : sectionTitle(doc, margin, yy, label, fs, 4, secColors);

    /** Folhas retrato: tarjas, painéis e grelhas podem usar preenchimentos muito suaves; rolos térmicos mantêm contraste simples. */
    let y = L.margin + 2.5;

    if (L.portraitSheet) {
      const sectionHead = portraitHead;

      y = paintPortraitTopStrip(
        doc,
        margin,
        pageW,
        y,
        L.brandColor,
        L.pureMonochromeBlack,
      );

      /* ── Folha retrato: dados da empresa · referência · cliente (grelha) ── */
      const contentW = pageW - 2 * margin;
      const gap = 6;
      /* Painel REFERÊNCIA — parte horizontal maior (mais espaço para data/estado/canal). */
      const rightW = Math.min(68, Math.max(48, Math.floor(contentW * 0.34)));
      const leftW = contentW - rightW - gap;
      const xR = margin + leftW + gap;
      const padR = 3;
      const blockTop = y;

      const portraitLogo = measurePortraitReceiptLogo(
        doc,
        payload.receiptLogoImage,
        leftW,
        widePortraitSheet,
      );
      const logoBelowGap = widePortraitSheet
        ? LOGO_TO_COMPANY_NAME_GAP_WIDE_MM
        : LOGO_TO_COMPANY_NAME_GAP_NARROW_MM;

      let yL = blockTop + (widePortraitSheet ? 4.6 : 3.95);
      if (portraitLogo) {
        const yLogo = Math.max(blockTop + 0.12, blockTop + 0.55 - LOGO_NUDGE_TOWARD_TOP_MM);
        doc.addImage(
          portraitLogo.uri,
          portraitLogo.format,
          margin,
          yLogo,
          portraitLogo.drawW,
          portraitLogo.drawH,
        );
        yL = yLogo + portraitLogo.drawH + logoBelowGap;
      }

      const titleRgb = L.brandColor ? BRAND : ink;
      doc.setFontSize(L.titleFs + (widePortraitSheet ? 1.35 : 0.95));
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...titleRgb);
      const titleWrap = doc.splitTextToSize(
        payload.sellerHeader.title,
        leftW,
      );
      doc.text(titleWrap, margin, yL);
      yL += titleWrap.length * (widePortraitSheet ? 6.05 : 5.45);

      if (payload.sellerHeader.companyTagline) {
        doc.setFontSize(Math.max(L.subTitleFs - 0.2, 8.45));
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...inkMuted);
        const tg = doc.splitTextToSize(
          payload.sellerHeader.companyTagline,
          leftW,
        );
        doc.text(tg, margin, yL + 1.5);
        yL += tg.length * 4.15 + 1.5;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(Math.max(L.metaFs - 1, 7.05));
      doc.setTextColor(...inkMuted);
      for (const ln of payload.sellerHeader.detailLines) {
        const wrapped = doc.splitTextToSize(ln, leftW);
        doc.text(wrapped, margin, yL);
        yL += wrapped.length * 3.65;
      }
      if (payload.sellerBankFooterLines.length > 0) {
        yL += widePortraitSheet ? 1.35 : 1.1;
        for (const ln of payload.sellerBankFooterLines) {
          const wrapped = doc.splitTextToSize(ln, leftW);
          doc.text(wrapped, margin, yL);
          yL += wrapped.length * 3.65;
        }
      }
      yL += widePortraitSheet ? 3.6 : 3.1;

      yL = drawPortraitDocTypeBadge(
        doc,
        margin,
        yL,
        INVOICE_DOCUMENT_MODEL_LABELS[payload.documentModel],
        leftW,
        L.brandColor,
        L.pureMonochromeBlack,
        ink,
      );
      /* Uma única linha de contexto — evita repetir o mesmo tipo de documento (já na etiqueta). */
      doc.setFontSize(Math.max(L.metaFs - 1.15, 6.85));
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...inkMuted);
      const natureza =
        payload.documentModel === "FACTURA_POR_FORMA"
          ? "Documento provisional · sem valor fiscal."
          : payload.documentModel === "FACTURA_RECIBO"
            ? "Documento de quitação da venda."
            : "Documento de cobrança.";
      const natOne = doc.splitTextToSize(natureza, leftW);
      doc.text(natOne, margin, yL);
      yL += natOne.length * 3.45 + (widePortraitSheet ? 2 : 1.75);

      const dateShort = doc.splitTextToSize(paidAtDisplayed, rightW - 2 * padR);
      const dateLinesCount = Math.max(dateShort.length, 1);

      const ptToMm = 25.4 / 72;
      /* A4 (~wide) usa número de pedido maior (orderNumFs≈12) — espaço fixo 7.55 mm deixava a data “além” do quadro. */
      const refLblFsEff = 7.35;
      const refLblDy = Math.max(
        ptToMm * refLblFsEff * (widePortraitSheet ? 1.38 : 1.3) +
          (widePortraitSheet ? 1.05 : 0.9),
        4.2,
      );
      const orderFsDraw =
        L.orderNumFs + (widePortraitSheet ? 0.45 : 0.25);
      const refOrdDy = Math.max(
        ptToMm *
          orderFsDraw *
          (widePortraitSheet ? 1.38 : 1.28) +
          (widePortraitSheet ? 1.95 : 1.55),
        widePortraitSheet ? 8.35 : 7.15,
      );
      const refMetaFsEff = Math.max(L.metaFs - 0.3, 7);
      const fsToMm = (refMetaFsEff / 72) * 25.4;
      /** Espaçamento explícito das linhas da data — igual no cálculo da caixa e no `doc.text`. */
      const lineHeightFactor = Math.max(1.22, Math.min(1.52, 3.98 / fsToMm));
      const refLinePitchMm = fsToMm * lineHeightFactor;
      const gapAfterDateBlock = Math.max(refLinePitchMm * 0.58, 2.08);
      const showEstado =
        payload.statusLabel != null && payload.statusLabel.trim() !== "";
      const estadoLines = showEstado
        ? doc.splitTextToSize(
            `Estado: ${payload.statusLabel}`,
            rightW - 2 * padR,
          )
        : [];
      const canalLines = doc.splitTextToSize(
        `Canal: ${payload.originLabel}`,
        rightW - 2 * padR,
      );
      const estadoLineCount = showEstado ? Math.max(estadoLines.length, 1) : 0;
      const canalLineCount = Math.max(canalLines.length, 1);
      /* jsPDF por vezes desenha ~0,3–0,5 mm por linha acima do nosso pitch em A4. */
      const dateBlockSlackMm =
        (dateLinesCount > 1 ? (dateLinesCount - 1) * 0.4 : 0) +
        (widePortraitSheet ? 0.55 : 0.35);
      /* Estado / canal: mesmo corpo da data — folga entre blocos. */
      const estadoCanalDy = refLinePitchMm * (widePortraitSheet ? 1.16 : 1.05);
      const refTailMm =
        refLinePitchMm * (widePortraitSheet ? 1.08 : 0.95) +
        (widePortraitSheet ? 2.15 : 1.7) +
        (estadoLineCount > 1 || canalLineCount > 1
          ? (estadoLineCount + canalLineCount - 2) * refLinePitchMm * 0.15
          : 0);

      /* Linha «Pedido …» só aparece com número fiscal — incluir no cálculo da caixa. */
      const pedidoLineDy = payload.documentNumber ? refLblDy * 0.85 : 0;
      const yBaselineDateFirst =
        blockTop + padR + refLblDy + refOrdDy + pedidoLineDy;
      const dateBlockBottomBaseline =
        yBaselineDateFirst +
        (dateLinesCount - 1) * refLinePitchMm +
        dateBlockSlackMm;
      const yBaselineEstado = dateBlockBottomBaseline + gapAfterDateBlock;
      const yBaselineCanal = showEstado
        ? yBaselineEstado +
          (estadoLineCount - 1) * refLinePitchMm +
          estadoCanalDy
        : yBaselineEstado;

      const refTextBottomY =
        yBaselineCanal +
        (canalLineCount - 1) * refLinePitchMm +
        refTailMm +
        padR;

      const minRefPanelH = 17;
      const boxH = Math.max(refTextBottomY - blockTop, minRefPanelH);
      const sepY = Math.max(blockTop + boxH, yL + (widePortraitSheet ? 5.5 : 5));
      const refFill: [number, number, number] = L.pureMonochromeBlack
        ? [255, 255, 255]
        : L.brandColor
          ? [254, 251, 246]
          : [250, 250, 252];
      doc.setFillColor(...refFill);
      doc.setDrawColor(
        ...(L.brandColor && !L.pureMonochromeBlack ? BRAND : lineDraw),
      );
      doc.setLineWidth(
        L.brandColor && !L.pureMonochromeBlack ? 0.34 : widePortraitSheet ? 0.24 : 0.22,
      );
      doc.roundedRect(
        xR,
        blockTop,
        rightW,
        boxH,
        L.badgeRounding + 0.6,
        L.badgeRounding + 0.6,
        "FD",
      );

      let yRIn = blockTop + padR;
      doc.setFontSize(7.35);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(L.brandColor && !L.pureMonochromeBlack ? BRAND : inkMuted));
      doc.text("REFERÊNCIA", xR + padR, yRIn);
      yRIn += refLblDy;
      doc.setFontSize(L.orderNumFs + (widePortraitSheet ? 0.45 : 0.25));
      doc.setFont("courier", "bold");
      doc.setTextColor(...ink);
      doc.text(payload.documentNumber ?? payload.orderNumber, xR + padR, yRIn);
      yRIn += refOrdDy;
      if (payload.documentNumber) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(Math.max(L.metaFs - 0.85, 6.5));
        doc.setTextColor(...inkMuted);
        doc.text(`Pedido ${payload.orderNumber}`, xR + padR, yRIn);
        yRIn += refLblDy * 0.85;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(L.metaFs - 0.3);
      doc.setTextColor(...inkMuted);
      doc.text(dateShort, xR + padR, yRIn, { lineHeightFactor });
      yRIn = dateBlockBottomBaseline + gapAfterDateBlock;
      if (showEstado) {
        doc.text(estadoLines, xR + padR, yRIn, { lineHeightFactor });
        yRIn =
          yRIn +
          (estadoLineCount - 1) * refLinePitchMm +
          estadoCanalDy;
      }
      doc.text(canalLines, xR + padR, yRIn, { lineHeightFactor });

      y = sepY + (widePortraitSheet ? 11.5 : 10);
      doc.setDrawColor(
        ...(L.brandColor && !L.pureMonochromeBlack
          ? ([210, 190, 165] as [number, number, number])
          : lineDraw),
      );
      doc.setLineWidth(0.38);
      doc.line(margin, y, pageW - margin, y);
      y += widePortraitSheet ? 7.25 : 6.35;

      y = sectionHead(y, "Cliente");
      y += 1.1;
      y = paintClientBlockHeaderMeta(
        doc,
        margin,
        y,
        contentW,
        payload,
        {
          labelFs: Math.max(L.metaFs, widePortraitSheet ? 7.35 : 7.05),
          valueFs: Math.max(L.lvFs - 0.1, widePortraitSheet ? 8.25 : 7.65),
          lineDy: widePortraitSheet ? 3.85 : 3.55,
          blockGap: widePortraitSheet ? 2.35 : 2.05,
          inkMuted,
          ink,
        },
      );
      y += 0.8;
      const labWC = Math.min(36, Math.floor(contentW * 0.23));
      const valWC = contentW - labWC - 1;
      const labelFill: [number, number, number] = L.pureMonochromeBlack
        ? [255, 255, 255]
        : L.brandColor
          ? [255, 249, 240]
          : [248, 248, 251];
      at(doc, {
        startY: y,
        body: [
          ["Nome", payload.clientName ?? "—"],
          ["Telefone", payload.clientPhone ?? "—"],
          ["E-mail", payload.clientEmail ?? "—"],
        ],
        theme: "plain",
        showHead: "never",
        styles: {
          fontSize: Math.max(L.lvFs - 0.15, widePortraitSheet ? 8.35 : 7.75),
          cellPadding: widePortraitSheet
            ? { top: 2.45, bottom: 2.45, left: 2.25, right: 2.25 }
            : { top: 2.15, bottom: 2.15, left: 2, right: 2 },
          textColor: ink,
          lineColor: tableLineRgb,
          lineWidth: 0.09,
          valign: "middle",
        },
        columnStyles: {
          0: {
            cellWidth: labWC,
            fontStyle: "bold",
            fillColor: labelFill,
            textColor: L.brandColor && !L.pureMonochromeBlack ? BRAND : inkMuted,
          },
          1: {
            cellWidth: valWC,
            fontStyle: "normal",
          },
        },
        margin: { left: margin, right: margin },
      });
      y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 26;
      y += 3.2;
      bumpThermalMm(y);
    } else {
      /* ── Rolos térmicos: nome da empresa + dados + modelo + bloco pedido ── */
      y = paintReceiptLogoThermalTop(
        doc,
        payload.receiptLogoImage,
        pageW,
        margin,
        y,
        narrowThermal58,
      );

      doc.setFontSize(L.titleFs + (narrowThermal58 ? 0 : 0.35));
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(L.pureMonochromeBlack ? ink : BRAND));
      const titleThermal = doc.splitTextToSize(
        payload.sellerHeader.title,
        pageW - 2 * margin,
      );
      doc.text(titleThermal, margin, y);
      /* Com linePitch constante, uma única linha ficava com avanço ~0 e as moradas
       * (ex.: «Angola») vinham no mesmo baseline que o nome — texto sobreposto. */
      const titleLinePitch = narrowThermal58 ? 4.05 : 4.35;
      let titleAdvance =
        titleThermal.length * Math.max(L.subTitleFs * 0.52, titleLinePitch) -
        Math.max(L.subTitleFs * 0.52, titleLinePitch - 0.35) +
        (titleThermal.length > 1 ? 2 : 0);
      titleAdvance = Math.max(titleAdvance, titleThermal.length * titleLinePitch);
      y += titleAdvance;
      if (payload.sellerHeader.companyTagline) {
        doc.setFontSize(Math.max(L.metaFs, 5.85));
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...inkMuted);
        const tgT = doc.splitTextToSize(
          payload.sellerHeader.companyTagline,
          pageW - 2 * margin,
        );
        doc.text(tgT, margin, y + 1.2);
        y += tgT.length * 3.15 + 1.2;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(Math.max(L.metaFs - 0.35, 5.75));
      doc.setTextColor(...inkMuted);
      const detailStep = narrowThermal58 ? 2.95 : 3.15;
      for (const ln of payload.sellerHeader.detailLines) {
        const wrapped = doc.splitTextToSize(ln, pageW - 2 * margin);
        doc.text(wrapped, margin, y);
        y += wrapped.length * detailStep;
      }
      if (payload.sellerBankFooterLines.length > 0) {
        y += narrowThermal58 ? 0.55 : 0.65;
        for (const ln of payload.sellerBankFooterLines) {
          const wrapped = doc.splitTextToSize(ln, pageW - 2 * margin);
          doc.text(wrapped, margin, y);
          y += wrapped.length * detailStep;
        }
      }
      y += narrowThermal58 ? 0.85 : 1.1;
      doc.setDrawColor(...THERM_BW_LINE);
      doc.setLineWidth(narrowThermal58 ? 0.28 : 0.42);
      doc.line(margin, y, pageW - margin, y);
      y += narrowThermal58 ? 1.35 : 1.55;
      doc.setLineWidth(0.12);
      doc.line(margin, y, pageW - margin, y);
      y += narrowThermal58 ? 2.95 : 3.35;

      const mLabel = INVOICE_DOCUMENT_MODEL_LABELS[payload.documentModel];
      const docModelBandH = narrowThermal58 ? 5.05 : 5.55;
      if (!L.pureMonochromeBlack) {
        doc.setFillColor(255, 250, 240);
      } else {
        doc.setFillColor(248, 248, 248);
      }
      if (L.badgeRounding > 0.3) {
        doc.roundedRect(
          margin,
          y,
          pageW - 2 * margin,
          docModelBandH,
          1.05,
          1.05,
          "F",
        );
      } else {
        doc.rect(margin, y, pageW - 2 * margin, docModelBandH, "F");
      }
      doc.setDrawColor(...THERM_BW_LINE);
      doc.setLineWidth(0.14);
      if (L.badgeRounding > 0.3) {
        doc.roundedRect(
          margin,
          y,
          pageW - 2 * margin,
          docModelBandH,
          1.05,
          1.05,
          "S",
        );
      } else {
        doc.rect(margin, y, pageW - 2 * margin, docModelBandH, "S");
      }
      doc.setFontSize(L.subTitleFs + (narrowThermal58 ? 0.05 : 0.2));
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLACK);
      doc.text(
        doc.splitTextToSize(mLabel, pageW - 2 * margin - 3.2)[0] ?? mLabel,
        margin + 1.6,
        y + docModelBandH - 1.75,
      );
      doc.setFont("helvetica", "normal");
      y += docModelBandH + (thermalRoll ? 3.55 : 3.2);

      doc.setDrawColor(...lineDraw);
      doc.setLineWidth(L.dividerW);
      doc.line(margin, y, pageW - margin, y);
      y += thermalRoll ? 4.85 : L.portraitSheet ? 5.5 : 5;

      const badgeW = pageW - 2 * margin;
      const badgePadding = Math.min(margin + 2, margin + 3);
      const padX = badgePadding;
      const contentTW = Math.max(badgeW - (padX - margin) * 2, 26);
      const dateLinesArr = doc.splitTextToSize(paidAtDisplayed, contentTW);
      /** Converte uma font‑size pt em espaçamento útil (~baseline) mm. */
      const fsToPad = (fsPt: number, k = 0.88): number =>
        (fsPt / 72) * 25.4 * k;
      const lhLblMm = fsToPad(L.orderLblFs);
      const lhNumMm = fsToPad(L.orderNumFs);

      const insetTopPedido = narrowThermal58 ? 1.85 : 2.35;
      const gapLblToNum = narrowThermal58 ? 0.85 : 1.1;
      const gapBeforeDate = narrowThermal58 ? 1.45 : 1.85;
      const bottomPadPedido = narrowThermal58 ? 1.85 : 2.35;

      const lineStep = Math.max(L.metaFs * 0.48, 3.15);
      const metaPadMm = fsToPad(L.metaFs, 0.88);

      const yPedLbl = y + insetTopPedido + lhLblMm;
      const yPedNum = yPedLbl + lhLblMm + gapLblToNum;

      let contentBottom = yPedNum + lhNumMm;
      let yDocLine: number | null = null;
      if (payload.documentNumber) {
        yDocLine = contentBottom + 1.1;
        contentBottom = yDocLine + 3.2;
      }

      const yDateFirst =
        dateLinesArr.length > 0 ? contentBottom + gapBeforeDate : contentBottom;
      if (dateLinesArr.length > 0) {
        contentBottom =
          yDateFirst +
          (dateLinesArr.length - 1) * lineStep +
          metaPadMm +
          (dateLinesArr.length > 1 ? 0.45 : 0.3);
      }

      let pedidoBoxH = contentBottom + bottomPadPedido - y;
      pedidoBoxH = Math.max(
        pedidoBoxH,
        narrowThermal58
          ? payload.documentNumber
            ? 14.5
            : 10.25
          : Math.min(L.headerBadgeH, payload.documentNumber ? 17 : 13.5),
      );

      const pedidoBg: [number, number, number] = L.pureMonochromeBlack
        ? [253, 253, 253]
        : [255, 251, 244];
      doc.setFillColor(...pedidoBg);
      doc.rect(margin, y, badgeW, pedidoBoxH, "F");
      doc.setDrawColor(...THERM_BW_LINE);
      doc.setLineWidth(0.15);
      if (L.badgeRounding > 0.3) {
        doc.roundedRect(
          margin,
          y,
          badgeW,
          pedidoBoxH,
          L.badgeRounding,
          L.badgeRounding,
          "S",
        );
      } else {
        doc.rect(margin, y, badgeW, pedidoBoxH, "S");
      }

      doc.setFontSize(L.orderLblFs);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(L.pureMonochromeBlack ? inkMuted : BRAND));
      doc.text("PEDIDO", padX, yPedLbl);

      doc.setFontSize(L.orderNumFs);
      doc.setFont("courier", "bold");
      doc.setTextColor(...ink);
      doc.text(payload.orderNumber, padX, yPedNum);

      if (payload.documentNumber && yDocLine != null) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(Math.max(L.metaFs - 0.5, 6.8));
        doc.setTextColor(...inkMuted);
        doc.text(`Doc. ${payload.documentNumber}`, padX, yDocLine);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(L.metaFs);
      doc.setTextColor(...inkMuted);
      if (dateLinesArr.length > 0) {
        doc.text(dateLinesArr, padX, yDateFirst);
      }

      y += pedidoBoxH + 3;
      bumpThermalMm(y);

      const colW = pageW - 2 * margin;
      y = sectionTitle(doc, margin, y, "Cliente", L.sectionFs, 4, secColors);
      y = paintClientBlockHeaderMeta(doc, margin, y + 1.2, colW, payload, {
        labelFs: Math.max(L.metaFs - 0.15, 5.65),
        valueFs: Math.max(L.lvFs - 0.25, 6.05),
        lineDy: 3.15,
        blockGap: 1.65,
        inkMuted,
        ink,
      });
      y += 0.6;
      y = labelValue(doc, margin, y, "Nome:", payload.clientName, colW, lvOpts);
      y = labelValue(
        doc,
        margin,
        y,
        "E-mail:",
        payload.clientEmail,
        colW,
        lvOpts,
      );
      y = labelValue(
        doc,
        margin,
        y,
        "Telefone:",
        payload.clientPhone ?? "—",
        colW,
        lvOpts,
      );
      y = labelValue(
        doc,
        margin,
        y,
        "Origem:",
        payload.originLabel,
        colW,
        lvOpts,
      );
      if (payload.statusLabel) {
        y = labelValue(
          doc,
          margin,
          y,
          "Estado:",
          payload.statusLabel,
          colW,
          lvOpts,
        );
      }
      y += 0.5;
      bumpThermalMm(y);
    }

    const hrThin = narrowThermal58 ? 0.18 : 0.23;
    y = hr(
      doc,
      y,
      margin,
      pageW,
      L.hrInset,
      hrThin,
      L.portraitSheet ? 4 : 3.35,
      thermalRoll ? THERM_BW_LINE : L.pureMonochromeBlack ? BLACK : undefined,
    );
    bumpThermalMm(y);

    const totalsBody = buildReceiptTotalsBody(
      payload,
      L.portraitSheet,
      narrowThermal58,
    );

    const [cw0, cw1, cw2, cw3] = resolveReceiptTableColWidths(L);
    const moneyTableFs = thermalRoll
      ? Math.max(L.tableFs - 0.55, 5.85)
      : L.tableFs;

    if (payload.tableBody.length > 0) {
      y = portraitHead(y, "Artigos");
      y += L.portraitSheet ? 1.15 : -0.65;
      const headFill: [number, number, number] =
        L.portraitSheet && L.brandColor && !L.pureMonochromeBlack
          ? [255, 236, 210]
          : L.portraitSheet
            ? [237, 237, 242]
            : [255, 255, 255];
      const headInk: [number, number, number] =
        L.portraitSheet && L.brandColor && !L.pureMonochromeBlack
          ? BRAND
          : ink;
      const altRow: [number, number, number] =
        L.portraitSheet && L.brandColor && !L.pureMonochromeBlack
          ? [255, 253, 249]
          : L.portraitSheet
            ? [252, 252, 254]
            : [255, 255, 255];
      at(doc, {
        startY: y,
        head: [L.tableHead],
        body: payload.tableBody,
        styles: {
          fontSize: L.tableFs,
          cellPadding: L.tablePad,
          textColor: ink,
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: {
          fillColor: headFill,
          textColor: headInk,
          lineColor: tableLineRgb,
          lineWidth: thermalRoll ? 0.12 : L.portraitSheet ? 0.1 : 0.11,
          fontStyle: "bold",
          halign: "center",
          valign: "middle",
        },
        alternateRowStyles: { fillColor: altRow },
        margin: { left: margin, right: margin },
        columnStyles: {
          0: {
            cellWidth: cw0,
            valign: "middle",
            overflow: "linebreak",
          },
          1: { cellWidth: cw1, halign: "center", valign: "middle" },
          2: {
            cellWidth: cw2,
            halign: "right",
            valign: "middle",
            fontSize: moneyTableFs,
          },
          3: {
            cellWidth: cw3,
            halign: "right",
            valign: "middle",
            fontSize: moneyTableFs,
            fontStyle: "bold",
          },
        },
        tableLineColor: tableLineRgb,
        tableLineWidth: thermalRoll ? 0.12 : 0.095,
      });
      y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;
      bumpThermalMm(y);
    } else {
      doc.setFontSize(L.lvFs);
      doc.setTextColor(...inkMuted);
      doc.text("(Sem linhas de artigo na resposta.)", margin, y);
      y += L.portraitSheet ? 8 : 6.5;
      bumpThermalMm(y);
    }

    y += L.portraitSheet ? 3 : 2.35;
    y = hr(
      doc,
      y,
      margin,
      pageW,
      L.hrInset,
      hrThin,
      L.portraitSheet ? 4 : 3.35,
      thermalRoll ? THERM_BW_LINE : L.pureMonochromeBlack ? BLACK : undefined,
    );
    bumpThermalMm(y);

    y = portraitHead(
      y,
      invoiceTotalsSectionHeading(payload.documentModel, L.portraitSheet),
    );
    y += L.portraitSheet ? 1.15 : -0.65;

    const totalsFs = L.totalsFs;
    const totalsTotalFs = L.totalsTotalFs;

    at(doc, {
      startY: y,
      body: totalsBody,
      showHead: "never",
      theme: "plain",
      styles: {
        fontSize: totalsFs,
        cellPadding: L.portraitSheet
          ? { top: 2.2, bottom: 2.2, left: 2, right: 2 }
          : { top: 1.45, bottom: 1.45, left: 1.05, right: 1.05 },
        textColor: ink,
        lineWidth: 0,
      },
      columnStyles: {
        0: { cellWidth: L.totalsLabelW, fontStyle: "normal" },
        1: { cellWidth: L.totalsValW, halign: "right" },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = data.row.raw as string[];
        const left = row[0];
        const isMainTotal =
          left === "Total pago" ||
          left === "Total" ||
          left === "Total (por forma)";
        if (L.portraitSheet && !isMainTotal && left !== "Troco") {
          const stripeA: [number, number, number] =
            L.brandColor && !L.pureMonochromeBlack
              ? [255, 253, 249]
              : [252, 252, 254];
          const stripeB: [number, number, number] =
            L.brandColor && !L.pureMonochromeBlack
              ? [252, 248, 242]
              : [247, 247, 250];
          data.cell.styles.fillColor =
            data.row.index % 2 === 0 ? stripeA : stripeB;
        }
        if (isMainTotal) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fontSize = totalsTotalFs;
          data.cell.styles.fillColor = L.portraitSheet
            ? L.brandColor && !L.pureMonochromeBlack
              ? [255, 236, 206]
              : [244, 244, 246]
            : [255, 255, 255];
          if (data.column.index === 1) {
            data.cell.styles.textColor =
              L.brandColor && !L.pureMonochromeBlack ? BRAND : BLACK;
          }
        }
        if (left === "Troco") {
          data.cell.styles.textColor = ink;
        }
      },
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 40;
    bumpThermalMm(y);
    y += L.portraitSheet ? 5 : 3.85;

    if (payload.attendantLine) {
      doc.setFontSize(L.attendantTitleFs);
      doc.setTextColor(...inkMuted);
      doc.text("Atendente / registo:", margin, y);
      doc.setTextColor(...ink);
      doc.setFont("helvetica", "italic");
      const attnLabelW = Math.max(
        doc.getTextWidth("Atendente / registo: "),
        L.portraitSheet ? 38 : 28,
      );
      const al = doc.splitTextToSize(
        payload.attendantLine,
        pageW - 2 * margin - attnLabelW - 2,
      );
      doc.text(al, margin + attnLabelW, y);
      doc.setFont("helvetica", "normal");
      y += Math.max(
        L.portraitSheet ? 4.5 : 3.95,
        al.length * (L.attendantFs * 0.45),
      );
      bumpThermalMm(y);
    }

    y =
      hr(
        doc,
        y + (L.portraitSheet ? 2 : 1.65),
        margin,
        pageW,
        Math.max(L.hrInset, L.footInset),
        hrThin,
        L.portraitSheet ? 4 : 3.35,
        thermalRoll ? THERM_BW_LINE : L.pureMonochromeBlack ? BLACK : undefined,
      ) - (L.portraitSheet ? 0 : 1);
    bumpThermalMm(y);
    doc.setFontSize(L.footFs);
    doc.setTextColor(...inkMuted);
    doc.setFont("helvetica", "italic");
    const footTxt = invoiceLegalFooterLine(
      payload.documentModel,
      L.portraitSheet,
    );
    const foot = doc.splitTextToSize(footTxt, pageW - 2 * margin);
    const lhFactor =
      typeof doc.getLineHeightFactor === "function"
        ? doc.getLineHeightFactor()
        : 1.15;
    const footLhMm = Math.max(
      (doc.getFontSize() / 72) *
        25.4 *
        (Number.isFinite(lhFactor) ? lhFactor : 1.15),
      3,
    );
    doc.text(foot, margin, y);
    doc.setFont("helvetica", "normal");

    const gapBeforeThanks = thermalRoll ? 2 : L.portraitSheet ? 2.8 : 3;
    const thanksY = y + foot.length * footLhMm + gapBeforeThanks;
    doc.setFontSize(thermalRoll ? L.footFs + 0.35 : L.footFs + 0.95);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(
      ...(L.brandColor && !L.pureMonochromeBlack && !thermalRoll
        ? BRAND
        : ink),
    );
    const thanksLines = doc.splitTextToSize(
      RECEIPT_THANK_YOU_PT,
      pageW - 2 * margin,
    );
    const thanksLhMm = Math.max(
      (doc.getFontSize() / 72) *
        25.4 *
        (Number.isFinite(lhFactor) ? lhFactor : 1.15),
      3,
    );
    doc.text(thanksLines, margin, thanksY);
    doc.setFontSize(L.footFs);
    doc.setFont("helvetica", "normal");
    let tailY = thanksY + thanksLines.length * thanksLhMm;
    if (payload.agtCertificationLine?.trim()) {
      const agtY = paintJsPdfAgtCertification(
        doc,
        payload.agtCertificationLine,
        {
          mode: "flow",
          y: tailY + (thermalRoll ? 1.5 : 2),
          margin,
          pageW,
          fontSize: thermalRoll ? Math.max(4.8, L.footFs - 0.6) : 6,
          centered: true,
        },
      );
      if (typeof agtY === "number") tailY = agtY;
    }
    bumpThermalMm(tailY);
  }

  if (format === "A4" || format === "A4_BW") {
    const sheet = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    });
    paintOnto(sheet);
    return sheet;
  }

  if (format === "A5_BW") {
    const sheet = new jsPDF({
      unit: "mm",
      format: "a5",
      orientation: "portrait",
    });
    paintOnto(sheet);
    return sheet;
  }

  const measureDoc = new jsPDF({
    unit: "mm",
    format: [L.pageWmm, THERMAL_ROLL_HEIGHT_MM],
    orientation: "portrait",
  });
  paintOnto(measureDoc);
  const measuredBottom = thermalExtentBottomMm;

  if (measureDoc.getNumberOfPages() !== 1) {
    return measureDoc;
  }

  const thermalMinPageMm = Math.max(L.margin + 42, 48);
  const pageH = Math.ceil(
    Math.min(
      THERMAL_ROLL_HEIGHT_MM,
      Math.max(
        measuredBottom +
          THERMAL_RECEIPT_TAIL_PAD_MM +
          THERMAL_PAGE_HEIGHT_SLACK_MM,
        thermalMinPageMm,
      ),
    ),
  );

  if (!Number.isFinite(pageH) || pageH < thermalMinPageMm) {
    return measureDoc;
  }

  const finalDoc = new jsPDF({
    unit: "mm",
    format: [L.pageWmm, pageH],
    orientation: "portrait",
  });
  paintOnto(finalDoc);
  if (finalDoc.getNumberOfPages() !== 1) {
    return measureDoc;
  }
  return finalDoc;
}

/**
 * Abre o comprovante para impressão: em **desktop** usa iframe + `print()`;
 * em **telemóvel / janela estreita** abre o PDF noutro separador (fallback: descarga
 * se o popup for bloqueado). Ver também `downloadPaymentReceiptPdf` e `sharePaymentReceiptPdf`.
 */
export async function openPaymentReceiptForPrint(
  payload: PaymentReceiptPdfPayload,
  options?: OpenReceiptPrintOptions,
): Promise<void> {
  const blob = await buildPaymentReceiptPdfBlob(payload, options?.format);
  const url = URL.createObjectURL(blob);
  const filename = receiptPdfFilename(
    payload.orderNumber,
    payload.documentModel,
  );

  const useMobilePath =
    !options?.forceDesktopPrint && isCoarseMobileOrNarrowViewport();

  if (useMobilePath) {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* */
        }
      }, 120_000);
      return;
    }
    triggerPdfBlobDownload(blob, filename);
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* */
    }
    return;
  }

  await new Promise<void>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute(
      "title",
      `${INVOICE_DOCUMENT_MODEL_LABELS[payload.documentModel]} — impressão`,
    );
    iframe.setAttribute(
      "style",
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none",
    );

    let finished = false;
    const cleanup = () => {
      window.setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          /* */
        }
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* */
        }
      }, 90_000);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };

    const tryPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        /* */
      }
    };

    iframe.onload = () => {
      window.setTimeout(() => {
        tryPrint();
        finish();
      }, 320);
    };

    iframe.src = url;
    document.body.appendChild(iframe);

    window.setTimeout(() => {
      if (!finished) {
        tryPrint();
        finish();
      }
    }, 2000);
  });
}
