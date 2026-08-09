import type { CashFlowReportApi } from "@/lib/api-client";
import { fetchDocumentBranding, paintJsPdfAgtFooter, paintJsPdfCompanyHeader } from "@/lib/document-branding";
import { formatMoney } from "@/lib/format-money";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type DocWithFinal = jsPDF & { lastAutoTable?: { finalY: number } };

function formatOccurredTs(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function granularityLabelPdf(
  g: CashFlowReportApi["granularity"],
): string {
  if (g === "monthly") return "Agregação mensal";
  if (g === "yearly") return "Agregação anual";
  return "Agregação diária";
}

/** Gera PDF com resumo do fluxo de caixa (browser). */
export async function downloadFinanceCashFlowPdf(
  report: CashFlowReportApi,
): Promise<void> {
  const branding = await fetchDocumentBranding();
  const cur = report.currency || "AOA";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;

  let y = await paintJsPdfCompanyHeader(doc, branding, {
    margin,
    documentTitle: "Fluxo de caixa",
    documentSubtitle: `Período ${report.periodFrom} → ${report.periodTo} · ${granularityLabelPdf(report.granularity)}`,
  });

  const linesSummary = [
    `Saldo inicial: ${formatMoney(report.openingBalance, cur)}`,
    `Entradas (razão PDV/vendas/manual): ${formatMoney(report.totals.receipts, cur)}`,
    `Saídas (numerário/expenses): ${formatMoney(report.totals.payments, cur)}`,
    `Líquido do período: ${formatMoney(report.totals.net, cur)}`,
    `Saldo final cumulativo: ${formatMoney(report.closingBalance, cur)}`,
  ];
  doc.setFontSize(10);
  for (const ln of linesSummary) {
    doc.text(ln, margin, y);
    y += 5;
  }
  y += 3;

  if (
    report.salePaymentMixTotal > 0 &&
    report.paymentBucketsPctOfReceiptMix &&
    report.noteReceiptMixPct === null
  ) {
    doc.setFontSize(10);
    doc.text("% receitas de vendas por meio (entre vendas registadas)", margin, y);
    y += 4;

    const mixRows: [string, string, string][] = [
      [
        "Dinheiro (numerário/TP físico)",
        `${report.paymentBucketsPctOfReceiptMix.DINHEIRO}%`,
        formatMoney(report.paymentBucketsReceiptsAbsolute.DINHEIRO, cur),
      ],
      [
        "TPA (cartões)",
        `${report.paymentBucketsPctOfReceiptMix.TPA}%`,
        formatMoney(report.paymentBucketsReceiptsAbsolute.TPA, cur),
      ],
      [
        "Transferências bancárias",
        `${report.paymentBucketsPctOfReceiptMix.TRANSFERENCIA}%`,
        formatMoney(report.paymentBucketsReceiptsAbsolute.TRANSFERENCIA, cur),
      ],
      [
        "Outros",
        `${report.paymentBucketsPctOfReceiptMix.OUTROS}%`,
        formatMoney(report.paymentBucketsReceiptsAbsolute.OUTROS, cur),
      ],
    ];

    autoTable(doc, {
      startY: y,
      head: [["Meio", "% do mix", `Valor (${cur})`]],
      body: mixRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [39, 39, 42] },
    });
    y = (doc as DocWithFinal).lastAutoTable?.finalY ?? y + 20;
    y += 10;
  }

  doc.setFontSize(10);
  doc.text("Fluxo por período", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Período", "Entradas", "Saídas", "Líquido", "Saldo acumulado"]],
    body: report.periods.map((p) => [
      p.periodKey,
      formatMoney(p.receipts, cur),
      formatMoney(p.payments, cur),
      formatMoney(p.net, cur),
      formatMoney(p.cumulativeClosing, cur),
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [39, 39, 42] },
  });
  y = (doc as DocWithFinal).lastAutoTable?.finalY ?? y + 20;
  y += 12;

  const ledgerRows = report.ledgerMovements ?? [];

  doc.setFontSize(10);
  doc.text("Movimentos do razão (com motivo por linha)", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Data/Hora", "Tipo", "Sentido", "Valor", "Motivo"]],
    body:
      ledgerRows.length > 0
        ? ledgerRows.map((m) => [
            formatOccurredTs(m.occurredAt),
            m.classification,
            m.direction === "IN" ? "Entrada" : "Saída",
            formatMoney(m.amount, cur),
            m.motive,
          ])
        : [["—", "—", "—", "—", "Sem linhas neste período"]],
    styles: { fontSize: 6, overflow: "linebreak" },
    columnStyles: { 4: { cellWidth: 58 } },
    headStyles: { fillColor: [39, 39, 42] },
  });
  y = (doc as DocWithFinal).lastAutoTable?.finalY ?? y + 20;
  y += 12;

  doc.setFontSize(10);
  doc.text(
    "Projeções — previsões (não movimentação realizada)",
    margin,
    y,
  );
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Data esperada", "Sentido", "Categoria", "Motivo", "Valor"]],
    body:
      report.projections.length > 0
        ? report.projections.map((px) => {
            const descr = px.description?.trim();
            const motivePx = descr ? `${px.category} · ${descr}` : px.category;
            return [
              px.expectedDate,
              px.direction === "IN" ? "Entrada prevista" : "Saída prevista",
              px.category,
              motivePx,
              formatMoney(px.amount, px.currency ?? cur),
            ];
          })
        : [["—", "—", "—", "Sem registos", "—"]],
    styles: { fontSize: 7 },
    headStyles: { fillColor: [113, 63, 18] },
  });
  y = (doc as DocWithFinal).lastAutoTable?.finalY ?? y + 24;
  y += 12;

  doc.setFontSize(9);
  doc.text(
    `Totais previstos no período: entradas ${formatMoney(report.projectionsSummaryInRange.expectedIn, cur)} · saídas ${formatMoney(report.projectionsSummaryInRange.expectedOut, cur)} · líquido ${formatMoney(report.projectionsSummaryInRange.netProjectedInRange, cur)}`,
    margin,
    y,
  );
  y += 6;
  doc.text(
    `Efeito líquido apenas em datas futuras: ${formatMoney(report.futureProjectionsNetFromToday, cur)}`,
    margin,
    y,
  );

  paintJsPdfAgtFooter(doc, branding, { margin });
  doc.save(`fluxo-caixa_${report.periodFrom}_${report.periodTo}.pdf`);
}
