import type { jsPDF } from "jspdf";
import { fetchDocumentBranding, paintJsPdfAgtFooter, paintJsPdfCompanyHeader } from "@/lib/document-branding";

export type RelatorioVendasPdfPayload = {
  generatedAt: string;
  periodLabel: string;
  periodRangeText: string;
  currency: string;
  kpis: {
    createdCount: number;
    cancelRatePct: string;
    cancelledCount: number;
    grossValueFmt: string;
    avgTicketFmt: string;
    deliveredCount: number;
    revenueDeliveredFmt: string;
    cancelledValueFmt: string;
  };
  trendCaption: string | null;
  trendRows: { dia: string; pedidos: number }[];
  statusBars: { estado: string; quantidade: number }[];
  topClients: {
    name: string;
    email: string;
    count: number;
    totalFmt: string;
  }[];
};

type DocWithTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

function safeFileNameStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

/**
 * Gera e descarrega um PDF com o resumo do relatório de vendas (admin).
 * Carrega jspdf/jspdf-autotable apenas no momento da exportação.
 */
export async function downloadRelatorioVendasPdf(
  payload: RelatorioVendasPdfPayload,
): Promise<void> {
  const [{ jsPDF }, autoTableImport] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const branding = await fetchDocumentBranding();
  const at =
    typeof autoTableImport.autoTable === "function"
      ? autoTableImport.autoTable
      : autoTableImport.default;

  const margin = 14;
  let y = await paintJsPdfCompanyHeader(doc, branding, {
    margin,
    documentTitle: "Relatório de vendas",
    documentSubtitle: [
      `Gerado em: ${payload.generatedAt}`,
      `Período: ${payload.periodLabel}`,
      `Intervalo: ${payload.periodRangeText}`,
    ],
  });

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(11);
  doc.text("Indicadores-chave", margin, y);
  y += 4;

  at(doc, {
    startY: y,
    head: [["Indicador", "Valor"]],
    body: [
      ["Pedidos criados (no período)", String(payload.kpis.createdCount)],
      ["Taxa de cancelamento", payload.kpis.cancelRatePct],
      ["Pedidos cancelados (no período)", String(payload.kpis.cancelledCount)],
      [
        "Valor total — pedidos activos (exclui cancelados)",
        payload.kpis.grossValueFmt,
      ],
      ["Ticket médio", payload.kpis.avgTicketFmt],
      [
        "Entregues (actualização no período)",
        String(payload.kpis.deliveredCount),
      ],
      ["Receita associada (entregues)", payload.kpis.revenueDeliveredFmt],
      ["Valor em cancelamentos", payload.kpis.cancelledValueFmt],
      ["Moeda", (payload.currency ?? "AOA").toUpperCase()],
    ],
    styles: { fontSize: 8, cellPadding: 1.8, textColor: [40, 40, 40] },
    headStyles: {
      fillColor: [180, 120, 30],
      textColor: 255,
      fontStyle: "bold",
    },
    margin: { left: margin, right: margin },
    tableWidth: 182,
  });

  let nextY = (doc as DocWithTable).lastAutoTable?.finalY ?? y + 50;
  nextY += 8;

  doc.setFontSize(10);
  doc.text("Novos pedidos por dia (amostra no gráfico)", margin, nextY);
  nextY += 5;

  const trendNote = payload.trendCaption
    ? `Nota: ${payload.trendCaption}`
    : "Nota: intervalo completo do período seleccionado.";
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(doc.splitTextToSize(trendNote, 182), margin, nextY);
  nextY += 12;

  const trendSlice = payload.trendRows.slice(-40);
  at(doc, {
    startY: nextY,
    head: [["Dia", "Pedidos criados"]],
    body: trendSlice.map((r) => [r.dia, String(r.pedidos)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [180, 120, 30], textColor: 255 },
    margin: { left: margin, right: margin },
    tableWidth: 182,
  });

  nextY = (doc as DocWithTable).lastAutoTable?.finalY ?? nextY + 40;
  nextY += 10;

  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text("Distribuição por estado (pedidos criados no período)", margin, nextY);
  nextY += 6;

  at(doc, {
    startY: nextY,
    head: [["Estado", "Quantidade"]],
    body: payload.statusBars.map((r) => [r.estado, String(r.quantidade)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [180, 120, 30], textColor: 255 },
    margin: { left: margin, right: margin },
    tableWidth: 182,
    columnStyles: {
      0: { cellWidth: 120 },
      1: { halign: "right", cellWidth: 62 },
    },
  });

  nextY = (doc as DocWithTable).lastAutoTable?.finalY ?? nextY + 40;
  nextY += 10;

  doc.setFontSize(10);
  doc.text(
    "Clientes por valor (pedidos activos no período; exclui cancelados)",
    margin,
    nextY,
  );
  nextY += 6;

  const clientRows =
    payload.topClients.length > 0
      ? payload.topClients.map((c) => [
          `${c.name}\n${c.email}`,
          String(c.count),
          c.totalFmt,
        ])
      : [["Sem dados neste período", "—", "—"]];

  at(doc, {
    startY: nextY,
    head: [["Cliente", "Pedidos", "Valor total"]],
    body: clientRows,
    styles: { fontSize: 7.5 },
    headStyles: { fillColor: [180, 120, 30], textColor: 255 },
    margin: { left: margin, right: margin },
    tableWidth: 182,
    columnStyles: {
      0: { cellWidth: 95 },
      1: { halign: "center", cellWidth: 22 },
      2: { halign: "right", cellWidth: 65 },
    },
  });

  nextY = (doc as DocWithTable).lastAutoTable?.finalY ?? nextY + 40;
  nextY += 8;

  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  const footer = doc.splitTextToSize(
    "Fonte: lista administrativa de pedidos (máximo 100 pedidos por carregamento). Para séries históricas completas ou agregações no servidor, contactar desenvolvimento.",
    182,
  );
  const pageH = doc.internal.pageSize.getHeight();
  const footerH = footer.length * 3.6;
  let fy = nextY + 6;
  if (fy + footerH > pageH - 12) {
    doc.addPage();
    fy = 18;
  }
  doc.text(footer, margin, fy);

  paintJsPdfAgtFooter(doc, branding, { margin });
  doc.save(`relatorio-vendas-${safeFileNameStamp()}.pdf`);
}
