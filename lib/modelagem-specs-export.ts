import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { DocumentBranding } from "@/lib/api-client";
import {
  buildCsvCompanyHeaderRows,
  fetchDocumentBranding,
  paintJsPdfAgtFooter,
  paintJsPdfCompanyHeader,
} from "@/lib/document-branding";
import type { ParsedModelagemSpecs } from "./modelagem-specs";

const LADO_LABEL: Record<string, string> = {
  AMBOS: "Ambos os lados",
  FRENTE: "Só frente",
  VERSO: "Só verso / costas",
};

export function ladoLabelForExport(lado: string): string {
  return LADO_LABEL[lado] ?? lado;
}

/** Há conteúdo útil para PDF / CSV / inclusão no ZIP. */
export function modelagemSpecsHasExportableContent(s: ParsedModelagemSpecs): boolean {
  if (s.textoExtra.trim()) return true;
  return s.linhas.some(
    (l) =>
      l.nome.trim() ||
      l.tamanho.trim() ||
      l.cor.trim() ||
      l.infoAdicional.trim(),
  );
}

/** Gera slug seguro para nomes de ficheiro (sem espaços estranhos). */
export function modelagemSpecsFileBase(orderNumber: string): string {
  const slug = orderNumber.replace(/[^\w.-]+/g, "_").trim();
  return slug || "pedido";
}

/** PDF A4 — notas livres + tabela por linhas. */
export async function buildModelagemSpecsPdfBlob(
  specs: ParsedModelagemSpecs,
  orderNumber: string,
  branding?: DocumentBranding,
): Promise<Blob> {
  const company = branding ?? (await fetchDocumentBranding());
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const margin = 14;
  let y = await paintJsPdfCompanyHeader(doc, company, {
    margin,
    documentTitle: "Especificações de produção",
    documentSubtitle: `Pedido: ${orderNumber}`,
  });

  const notes = specs.textoExtra.trim();
  if (notes) {
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text("Notas livres", margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    const split = doc.splitTextToSize(notes, 182);
    doc.text(split, margin, y);
    y += split.length * 4.85 + 6;
  }

  if (specs.linhas.length > 0) {
    autoTable(doc, {
      startY: Math.min(y, 250),
      margin: { left: margin, right: margin },
      head: [["Nome", "Tamanho", "Cor", "Info adicional", "Lado"]],
      body: specs.linhas.map((l) => [
        l.nome.trim() || "—",
        l.tamanho.trim() || "—",
        l.cor.trim() || "—",
        l.infoAdicional.trim() || "—",
        ladoLabelForExport(l.lado),
      ]),
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: [15, 118, 110], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 250] },
      theme: "striped",
    });
  }

  paintJsPdfAgtFooter(doc, company, { margin });
  return doc.output("blob") as Blob;
}

function csvCell(val: string): string {
  const s = String(val ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

/**
 * CSV com separador «;», linha inicial SEP para Excel (PT).
 * Abrindo no Excel mantém acentuação via BOM UTF-8.
 */
export async function buildModelagemSpecsCsvBlob(
  specs: ParsedModelagemSpecs,
  orderNumber: string,
  branding?: DocumentBranding,
): Promise<Blob> {
  const company = branding ?? (await fetchDocumentBranding());
  const sep = ";";
  const lines: string[] = [`SEP=${sep}`, ...buildCsvCompanyHeaderRows(
    company,
    "Especificações de produção",
  )];
  lines.push(`${csvCell("Pedido")}${sep}${csvCell(orderNumber)}`);
  lines.push(`${csvCell("Notas livres")}${sep}${csvCell(specs.textoExtra)}`);
  lines.push("");
  lines.push(
    ["Nome", "Tamanho", "Cor", "Info adicional", "Lado"]
      .map((h) => csvCell(h))
      .join(sep),
  );
  for (const l of specs.linhas) {
    lines.push(
      [
        csvCell(l.nome),
        csvCell(l.tamanho),
        csvCell(l.cor),
        csvCell(l.infoAdicional),
        csvCell(ladoLabelForExport(l.lado)),
      ].join(sep),
    );
  }
  const bom = "\uFEFF";
  return new Blob([bom + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export async function downloadModelagemSpecsPdf(
  specs: ParsedModelagemSpecs,
  orderNumber: string,
): Promise<void> {
  const base = modelagemSpecsFileBase(orderNumber);
  const blob = await buildModelagemSpecsPdfBlob(specs, orderNumber);
  triggerBlobDownload(blob, `${base}_especificacoes-producao.pdf`);
}

export async function downloadModelagemSpecsExcelCsv(
  specs: ParsedModelagemSpecs,
  orderNumber: string,
): Promise<void> {
  const base = modelagemSpecsFileBase(orderNumber);
  const blob = await buildModelagemSpecsCsvBlob(specs, orderNumber);
  triggerBlobDownload(blob, `${base}_especificacoes-producao.csv`);
}
