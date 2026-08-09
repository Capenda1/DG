import type { jsPDF } from "jspdf";
import type { BusinessProfileSettings } from "@/lib/api-client";
import {
  businessLogoDisplayUrl,
  getBusinessProfileSettings,
  getDocumentBranding as fetchDocumentBrandingApi,
  type DocumentBranding,
} from "@/lib/api-client";

export type { DocumentBranding };

export type EmbeddedLogoImage = {
  format: "PNG" | "JPEG" | "WEBP";
  base64: string;
};

const DEFAULT_COMPANY_NAME = "Dádiva Go";
const LOGO_MAX_BYTES = 2_500_000;

const PDF_TITLE: [number, number, number] = [22, 22, 24];
const PDF_MUTED: [number, number, number] = [90, 90, 95];
const PDF_LINE: [number, number, number] = [210, 205, 198];

function trim(s: string | null | undefined): string {
  return s?.trim() ?? "";
}

/** Formata morada completa a partir do perfil da empresa. */
export function formatCompanyAddress(
  profile: Pick<
    BusinessProfileSettings,
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "provinceRegion"
    | "country"
  >,
): string {
  const cityRegion = [trim(profile.city), trim(profile.provinceRegion)]
    .filter(Boolean)
    .join(", ");
  return [
    trim(profile.addressLine1),
    trim(profile.addressLine2),
    cityRegion || null,
    trim(profile.country),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Telefone, email e website numa linha. */
export function formatCompanyContact(
  profile: Pick<BusinessProfileSettings, "phone" | "email" | "website">,
): string {
  const parts: string[] = [];
  const phone = trim(profile.phone);
  const email = trim(profile.email);
  const web = trim(profile.website);
  if (phone) parts.push(phone.startsWith("+") ? phone : `Tel: ${phone}`);
  if (email) parts.push(email);
  if (web) parts.push(web);
  return parts.join(" · ");
}

/** Linhas padronizadas: NIF, morada, contacto (ordem fixa em documentos). */
export function buildDocumentIdentityLines(
  profile: BusinessProfileSettings | null | undefined,
): string[] {
  if (!profile) return [];
  const lines: string[] = [];
  const tax = trim(profile.taxId);
  if (tax) lines.push(`NIF / Contribuinte: ${tax}`);
  const address = formatCompanyAddress(profile);
  if (address) lines.push(`Morada: ${address}`);
  const contact = formatCompanyContact(profile);
  if (contact) lines.push(`Contacto: ${contact}`);
  return lines;
}

export function profileToDocumentBranding(
  profile: BusinessProfileSettings | null | undefined,
): DocumentBranding {
  const displayName = trim(profile?.companyName) || DEFAULT_COMPANY_NAME;
  return {
    displayName,
    legalName: trim(profile?.legalName),
    tagline: trim(profile?.tagline),
    logoUrl: trim(profile?.logoUrl),
    taxId: trim(profile?.taxId),
    address: formatCompanyAddress(profile ?? ({} as BusinessProfileSettings)),
    phone: trim(profile?.phone),
    email: trim(profile?.email),
    website: trim(profile?.website),
    identityLines: buildDocumentIdentityLines(profile),
    agtCertificationLine: trim(profile?.agtCertificationLine),
  };
}

export function fallbackDocumentBranding(): DocumentBranding {
  return profileToDocumentBranding(null);
}

/** Carrega branding da API; fallback local se falhar. */
export async function fetchDocumentBranding(): Promise<DocumentBranding> {
  try {
    return await fetchDocumentBrandingApi();
  } catch {
    try {
      const profile = await getBusinessProfileSettings();
      return profileToDocumentBranding(profile);
    } catch {
      return fallbackDocumentBranding();
    }
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function sniffLogoFormat(bytes: Uint8Array): "PNG" | "JPEG" | "WEBP" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "PNG";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "JPEG";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "WEBP";
  }
  return null;
}

function parseDataUrlLogo(dataUrl: string): EmbeddedLogoImage | null {
  const m =
    /^data:image\/(png|jpeg|jpg|webp);base64,([\s\S]+)/i.exec(dataUrl.trim());
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const format =
    kind === "png" ? "PNG" : kind === "webp" ? "WEBP" : "JPEG";
  const base64 = m[2].replace(/\s+/g, "");
  return base64.length ? { format, base64 } : null;
}

/** Descarrega logótipo para incorporar em PDF. */
export async function loadDocumentLogoImage(
  logoUrl: string | null | undefined,
): Promise<EmbeddedLogoImage | null> {
  const raw = trim(logoUrl);
  if (!raw) return null;
  if (raw.startsWith("data:")) return parseDataUrlLogo(raw);

  const display = businessLogoDisplayUrl(raw);
  if (!display) return null;

  try {
    const res = await fetch(display, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > LOGO_MAX_BYTES) return null;
    const bytes = new Uint8Array(buf);
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    let format: "PNG" | "JPEG" | "WEBP" | null = null;
    if (ct.includes("png")) format = "PNG";
    else if (ct.includes("jpeg") || ct.includes("jpg")) format = "JPEG";
    else if (ct.includes("webp")) format = "WEBP";
    else format = sniffLogoFormat(bytes);
    if (!format) return null;
    return { format, base64: arrayBufferToBase64(buf) };
  } catch {
    return null;
  }
}

/** Compatibilidade com comprovantes — alias do loader partilhado. */
export const loadReceiptLogoImage = loadDocumentLogoImage;

export type PaintCompanyHeaderOptions = {
  margin?: number;
  startY?: number;
  documentTitle: string;
  documentSubtitle?: string | string[];
  withLogo?: boolean;
  titleSize?: number;
  companyNameSize?: number;
};

/**
 * Cabeçalho institucional em jsPDF: nome comercial, NIF, morada, contacto + título do documento.
 * Devolve a posição Y onde o conteúdo principal deve começar.
 */
export async function paintJsPdfCompanyHeader(
  doc: jsPDF,
  branding: DocumentBranding,
  opts: PaintCompanyHeaderOptions,
): Promise<number> {
  const margin = opts.margin ?? 14;
  const pageW = doc.internal.pageSize.getWidth();
  let y = opts.startY ?? 14;

  let logo: EmbeddedLogoImage | null = null;
  if (opts.withLogo !== false && branding.logoUrl) {
    logo = await loadDocumentLogoImage(branding.logoUrl);
  }

  if (logo) {
    const logoW = 22;
    const logoH = 14;
    const logoX = pageW - margin - logoW;
    doc.addImage(
      `data:image/${logo.format === "JPEG" ? "jpeg" : logo.format.toLowerCase()};base64,${logo.base64}`,
      logo.format,
      logoX,
      y - 1,
      logoW,
      logoH,
      undefined,
      "FAST",
    );
  }

  doc.setTextColor(...PDF_TITLE);
  doc.setFontSize(opts.companyNameSize ?? 13);
  doc.setFont("helvetica", "bold");
  doc.text(branding.displayName, margin, y);
  y += 5.5;

  if (branding.legalName && branding.legalName !== branding.displayName) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_MUTED);
    doc.text(branding.legalName, margin, y);
    y += 4.5;
  }

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_MUTED);
  for (const line of branding.identityLines) {
    const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 3.8 + 0.8;
  }

  y += 2;
  doc.setDrawColor(...PDF_LINE);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  doc.setTextColor(...PDF_TITLE);
  doc.setFontSize(opts.titleSize ?? 14);
  doc.setFont("helvetica", "bold");
  doc.text(opts.documentTitle, margin, y);
  y += 6;

  const subs = opts.documentSubtitle
    ? Array.isArray(opts.documentSubtitle)
      ? opts.documentSubtitle
      : [opts.documentSubtitle]
    : [];
  if (subs.length) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_MUTED);
    for (const sub of subs) {
      const wrapped = doc.splitTextToSize(sub, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 4 + 1;
    }
  }

  y += 4;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  return y;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bloco HTML para impressão (Z de caixa, RH, etc.). */
export function buildHtmlCompanyLetterhead(
  branding: DocumentBranding,
  documentTitle: string,
  documentSubtitle?: string,
): string {
  const identity = branding.identityLines
    .map((l) => `<p class="company-line">${escapeHtml(l)}</p>`)
    .join("");
  const legal =
    branding.legalName && branding.legalName !== branding.displayName
      ? `<p class="company-legal">${escapeHtml(branding.legalName)}</p>`
      : "";
  const sub = documentSubtitle
    ? `<p class="doc-sub">${escapeHtml(documentSubtitle)}</p>`
    : "";

  return `
    <header class="company-header">
      <div class="company-block">
        <p class="company-name">${escapeHtml(branding.displayName)}</p>
        ${legal}
        ${identity}
      </div>
      <div class="doc-head">
        <h1 class="doc-title">${escapeHtml(documentTitle)}</h1>
        ${sub}
      </div>
    </header>
  `;
}

export const HTML_LETTERHEAD_STYLES = `
  .company-header { margin-bottom: 1.25rem; padding-bottom: .85rem; border-bottom: 2px solid #e5e7eb; }
  .company-name { margin: 0; font-size: 1.05rem; font-weight: 700; color: #111; }
  .company-legal { margin: .15rem 0 0; font-size: .78rem; color: #555; }
  .company-line { margin: .2rem 0 0; font-size: .78rem; color: #444; line-height: 1.35; }
  .doc-head { margin-top: .85rem; }
  .doc-title { margin: 0; font-size: 1.15rem; font-weight: 700; color: #111; }
  .doc-sub { margin: .25rem 0 0; font-size: .8rem; color: #666; }
`;

/** Prefixo CSV com dados da empresa (Excel PT). */
export function buildCsvCompanyHeaderRows(
  branding: DocumentBranding,
  reportTitle?: string,
): string[] {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    `${esc("Empresa")};${esc(branding.displayName)}`,
    `${esc("NIF")};${esc(branding.taxId)}`,
    `${esc("Morada")};${esc(branding.address)}`,
    `${esc("Contacto")};${esc(formatCompanyContact(branding))}`,
  ];
  if (reportTitle) {
    rows.push(`${esc("Documento")};${esc(reportTitle)}`);
  }
  if (branding.agtCertificationLine?.trim()) {
    rows.push(`${esc("Licença AGT")};${esc(branding.agtCertificationLine.trim())}`);
  }
  rows.push("");
  return rows;
}

/** Converte branding para o cabeçalho do comprovante de pagamento. */
export function brandingToReceiptSellerHeader(
  branding: DocumentBranding,
): {
  title: string;
  companyTagline: string | null;
  detailLines: string[];
} {
  const detailLines: string[] = [];
  if (branding.legalName && branding.legalName !== branding.displayName) {
    detailLines.push(branding.legalName);
  }
  detailLines.push(...branding.identityLines);
  return {
    title: branding.displayName,
    companyTagline: branding.tagline || null,
    detailLines: detailLines.slice(0, 12),
  };
}

export function businessProfileToSellerHeader(
  profile: BusinessProfileSettings | null | undefined,
): ReturnType<typeof brandingToReceiptSellerHeader> {
  return brandingToReceiptSellerHeader(profileToDocumentBranding(profile));
}

const PDF_AGT: [number, number, number] = [105, 105, 110];

export type AgtCertificationPaintOptions = {
  margin?: number;
  pageW?: number;
  /** `flow`: segue o conteúdo (térmicas); `page-bottom`: fixo no fim da última página. */
  mode?: "flow" | "page-bottom";
  /** Posição Y actual (obrigatório em `flow`). */
  y?: number;
  fontSize?: number;
  bottomMm?: number;
  centered?: boolean;
};

/**
 * Imprime a linha de certificação AGT — letra pequena, no final do documento.
 * Em modo `flow` devolve a nova posição Y; em `page-bottom` não devolve valor.
 */
export function paintJsPdfAgtCertification(
  doc: jsPDF,
  line: string | null | undefined,
  opts: AgtCertificationPaintOptions = {},
): number | void {
  const text = trim(line);
  if (!text) return opts.y;

  const margin = opts.margin ?? 14;
  const pageW = opts.pageW ?? doc.internal.pageSize.getWidth();
  const fontSize = opts.fontSize ?? 6;
  const centered = opts.centered !== false;
  const maxW = pageW - margin * 2;
  const lhMm = (fontSize / 72) * 25.4 * 1.15;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...PDF_AGT);

  const wrapped: string[] = doc.splitTextToSize(text, maxW);

  if (opts.mode === "page-bottom") {
    const pageCount = doc.getNumberOfPages();
    doc.setPage(pageCount);
    const pageH = doc.internal.pageSize.getHeight();
    const bottomMm = opts.bottomMm ?? 6;
    const blockH = wrapped.length * lhMm;
    let y = pageH - bottomMm - blockH + lhMm * 0.9;
    for (const wline of wrapped) {
      if (centered) {
        doc.text(wline, pageW / 2, y, { align: "center" });
      } else {
        doc.text(wline, margin, y);
      }
      y += lhMm;
    }
    return;
  }

  let y = (opts.y ?? margin) + (opts.y !== undefined ? 2.5 : 0);
  for (const wline of wrapped) {
    if (centered) {
      doc.text(wline, pageW / 2, y, { align: "center" });
    } else {
      doc.text(wline, margin, y);
    }
    y += lhMm;
  }
  return y + 1;
}

/** Rodapé AGT em PDFs com branding completo. */
export function paintJsPdfAgtFooter(
  doc: jsPDF,
  branding: DocumentBranding,
  opts?: Omit<AgtCertificationPaintOptions, "y"> & { y?: number },
): number | void {
  return paintJsPdfAgtCertification(doc, branding.agtCertificationLine, {
    mode: "page-bottom",
    ...opts,
  });
}

/** Rodapé HTML para impressão. */
export function buildHtmlAgtFooter(branding: DocumentBranding): string {
  const line = trim(branding.agtCertificationLine);
  if (!line) return "";
  return `<footer class="agt-footer">${escapeHtml(line)}</footer>`;
}

export const HTML_AGT_FOOTER_STYLES = `
  .agt-footer {
    margin-top: 2rem;
    padding-top: .55rem;
    border-top: 1px solid #e8e8e8;
    font-size: .62rem;
    line-height: 1.4;
    color: #666;
    text-align: center;
  }
`;
