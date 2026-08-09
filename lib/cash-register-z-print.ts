/** Relatório de fecho (Z de caixa) — formato alinhado com `finance.service.ts` ao encerrar o turno. */
export type PdvCashZReportTotals = {
  openingFloat: number;
  cashSalesTotal: number;
  nonCashSalesTotal: number;
  supplementsTotal: number;
  withdrawalsTotalAbs: number;
  expectedCash: number;
  declaredCash: number;
  cashDifference: number;
};

export type PdvCashZReportLine = {
  at: string;
  amount: number;
  justification: string;
};

export type PdvCashZReportSnapshot = {
  currency: string;
  sessionId: string;
  openedAt: string;
  closedAt: string;
  operators: { openedBy: string; closedBy: string };
  totals: PdvCashZReportTotals;
  supplementLines: Array<{ id?: string } & PdvCashZReportLine>;
  withdrawalLines: Array<{ id?: string } & PdvCashZReportLine>;
  byPaymentMethod: Record<string, number>;
  settlementCount: number;
  closingNotes: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoneyPt(n: number, currency = "AOA"): string {
  return `${Number(n).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function rowsBlock(
  title: string,
  lines: Array<PdvCashZReportLine>,
  variant: "in" | "out",
): string {
  if (!lines?.length)
    return `<p class="muted">${escapeHtml(title)}: nenhum registo neste turno.</p>`;
  const thead =
    `<tr><th>Data/Hora</th><th class="tar">Valor (${variant === "out" ? "saída" : "entrada"})</th><th>Justificação</th></tr>`;
  const body = lines
    .map((l) => {
      const d = escapeHtml(new Date(l.at).toLocaleString("pt-PT"));
      const j = escapeHtml(l.justification || "—");
      const amt = formatMoneyPt(l.amount);
      return `<tr><td class="muted">${d}</td><td class="tar amt ${variant === "out" ? "outflow" : ""}">${escapeHtml(amt)}</td><td>${j}</td></tr>`;
    })
    .join("");
  return `<h3>${escapeHtml(title)}</h3><table>${thead}<tbody>${body}</tbody></table>`;
}

/**
 * Abre uma janela com o relatório de fecho (Z de caixa) pronta para impressão ou PDF.
 */
export async function openCashRegisterClosingPrint(
  snapshot: PdvCashZReportSnapshot,
): Promise<void> {
  const { fetchDocumentBranding, buildHtmlCompanyLetterhead, buildHtmlAgtFooter, HTML_LETTERHEAD_STYLES, HTML_AGT_FOOTER_STYLES } =
    await import("@/lib/document-branding");
  const branding = await fetchDocumentBranding();
  const t = snapshot.totals;
  const pmRows = Object.entries(snapshot.byPaymentMethod || {})
    .map(
      ([k, v]) =>
        `<tr><td>${escapeHtml(k)}</td><td class="tar">${escapeHtml(formatMoneyPt(v))}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8" />
  <title>Z de Caixa · ${escapeHtml(snapshot.sessionId.slice(0, 8))}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.25rem 1.5rem; color: #111; }
    ${HTML_LETTERHEAD_STYLES}
    ${HTML_AGT_FOOTER_STYLES}
    h2 { font-size: 1rem; margin: 1.25rem 0 .5rem; color: #333; }
    h3 { font-size: .9rem; margin: .75rem 0 .35rem; }
    table { width:100%; border-collapse: collapse; margin: .35rem 0 .75rem; font-size:.85rem; }
    th, td { border: 1px solid #ccc; padding: .35rem .5rem; vertical-align: top; }
    th { background:#f5f5f5; text-align:left; }
    .tar { text-align: right; }
    .muted { color:#555; font-size:.8rem; }
    .banner { padding:.6rem .75rem; border: 1px solid #e09b2c; border-radius:6px; background:#fff8ea; margin: .75rem 0; }
    .diff { font-weight:700; }
    .diff.ok { color: #166534; }
    .diff.warn { color: #9a3412; }
    .amt.outflow { color: #991b1b; }
    @media print {
      body { margin: .5cm; }
      .no-print { display: none !important; }
      a { text-decoration:none; color: inherit; }
    }
    .no-print { margin: .75rem 0; display:flex; gap:.5rem; flex-wrap:wrap; }
    button { padding:.45rem .8rem; font-weight:600; cursor:pointer; border-radius:6px; border: 1px solid #333; background:#eee; }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
    <button type="button" onclick="window.close()">Fechar</button>
  </div>
  ${buildHtmlCompanyLetterhead(
    branding,
    "Z de Caixa",
    `Turno PDV · Moeda ${snapshot.currency}`,
  )}
  <div class="banner">
    <strong>Saldo esperado</strong>: ${escapeHtml(formatMoneyPt(t.expectedCash))}
    • <strong>Saldo contado</strong>: ${escapeHtml(formatMoneyPt(t.declaredCash))}
    • <strong>Quebra (diferença)</strong>:
    <span class="diff ${t.cashDifference === 0 ? "ok" : "warn"}">${escapeHtml(formatMoneyPt(t.cashDifference))}</span>
  </div>
  <p class="muted">Aberto: ${escapeHtml(new Date(snapshot.openedAt).toLocaleString("pt-PT"))}<br/>
  Fecho: ${escapeHtml(new Date(snapshot.closedAt).toLocaleString("pt-PT"))}<br/>
  Abertura por: ${escapeHtml(snapshot.operators.openedBy)} • Fecho por: ${escapeHtml(snapshot.operators.closedBy)}</p>

  <h2>Quadro financeiro</h2>
  <table>
    <tbody>
      <tr><td>Fundo abertura</td><td class="tar">${escapeHtml(formatMoneyPt(t.openingFloat))}</td></tr>
      <tr><td>Vendas dinheiro (PDV)</td><td class="tar">${escapeHtml(formatMoneyPt(t.cashSalesTotal))}</td></tr>
      <tr><td>Suprimentos</td><td class="tar">+ ${escapeHtml(formatMoneyPt(t.supplementsTotal))}</td></tr>
      <tr><td>Saídas de numerário</td><td class="tar">− ${escapeHtml(formatMoneyPt(t.withdrawalsTotalAbs))}</td></tr>
      <tr><td><strong>Numerário esperado no cofre</strong></td><td class="tar"><strong>${escapeHtml(formatMoneyPt(t.expectedCash))}</strong></td></tr>
      <tr><td>Outras liquidações (cartão/outros métodos)</td><td class="tar">${escapeHtml(formatMoneyPt(t.nonCashSalesTotal))}</td></tr>
      <tr><td class="muted">N.º operações registadas na razão deste turno</td><td class="tar">${escapeHtml(String(snapshot.settlementCount))}</td></tr>
    </tbody>
  </table>

  <h3>Por método de pagamento (turno)</h3>
  <table><thead><tr><th>Método</th><th class="tar">Valor</th></tr></thead><tbody>${
    pmRows || `<tr><td colspan="2" class="muted">Sem dados</td></tr>`
  }</tbody></table>

  ${rowsBlock("Suprimentos registados", snapshot.supplementLines as PdvCashZReportLine[], "in")}
  ${rowsBlock("Saídas registadas", snapshot.withdrawalLines as PdvCashZReportLine[], "out")}

  ${snapshot.closingNotes ? `<h2>Notas ao fecho</h2><p>${escapeHtml(snapshot.closingNotes)}</p>` : ""}

  <p class="muted" style="margin-top:2rem;">Documento para arquivo interno e controlo financeiro. Assinatura operador/fiscal: ______________________ · Data __________</p>
  ${buildHtmlAgtFooter(branding)}
</body></html>`;

  const w = window.open("", "_blank", "width=840,height=900");
  if (!w) {
    alert("Permita pop-ups para imprimir o Z de caixa.");
    return;
  }
  w.document.write(html);
  w.document.close();
}
