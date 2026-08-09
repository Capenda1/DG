"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  createRhDocument,
  createRhSalaryPayment,
  deleteRhDocument,
  deleteRhSalaryPayment,
  fetchRhDocumentFileBlob,
  getRhOverview,
  registerRhDailyPunch,
  upsertRhDailyAttendance,
  upsertRhProfile,
  type RhCollaboratorView,
  type RhContractStatus,
  type RhDailyAttendanceView,
  type RhDayStatus,
  type RhDocumentStatus,
  type RhDocumentType,
  type RhDocumentView,
  type RhSalaryBalanceLine,
  type RhSalaryPaymentType,
  type RhSalaryPaymentView,
} from "@/lib/api-client";
import type { DocumentBranding } from "@/lib/api-client";
import {
  buildCsvCompanyHeaderRows,
  buildHtmlAgtFooter,
  buildHtmlCompanyLetterhead,
  fetchDocumentBranding,
  HTML_AGT_FOOTER_STYLES,
  HTML_LETTERHEAD_STYLES,
  paintJsPdfAgtFooter,
  paintJsPdfCompanyHeader,
} from "@/lib/document-branding";
import { ROUTES } from "@/lib/routes";
import { RhPanels } from "@/components/admin/rh/RhPanels";
import {
  RhKpi,
  RhModal,
  RhPageHeader,
  RhTabs,
  rhBtnGhost,
  rhBtnPrimary,
  rhInputClass,
  rhLabelClass,
} from "@/components/admin/rh/rh-ui";
import {
  currentMonthKey,
  downloadTextFile,
  moneyAoa,
  todayIsoDate,
  todayPtDate,
  toCsv,
  type RhTabId,
  ROLE_LABELS,
} from "@/components/admin/rh/rh-utils";

type DocumentStatus = RhDocumentStatus;
type DocWithFinal = jsPDF & { lastAutoTable?: { finalY: number } };

async function createRhPdf(title: string, subtitle?: string) {
  const branding = await fetchDocumentBranding();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const startY = await paintJsPdfCompanyHeader(doc, branding, {
    documentTitle: title,
    documentSubtitle: subtitle,
  });
  return { doc, branding, startY };
}

async function rhPrintHtml(
  documentTitle: string,
  bodyContent: string,
  subtitle?: string,
) {
  const branding = await fetchDocumentBranding();
  const w = window.open("", "_blank", "width=1000,height=760");
  if (!w) return;
  w.document.write(`
    <html><head><title>${documentTitle}</title>
    <style>
    body{font-family:Arial,sans-serif;padding:24px;color:#111}
    ${HTML_LETTERHEAD_STYLES}
    ${HTML_AGT_FOOTER_STYLES}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:8px;font-size:12px;text-align:left}
    th{background:#f3f4f6}
    </style></head><body>
    ${buildHtmlCompanyLetterhead(branding, documentTitle, subtitle)}
    ${bodyContent}
    ${buildHtmlAgtFooter(branding)}
    </body></html>
  `);
  w.document.close();
  w.focus();
  w.print();
}

function contractTemplateText(
  collaborator?: RhCollaboratorView,
  branding?: DocumentBranding,
): string {
  const nomeColaborador = collaborator?.nome ?? "[Nome Completo]";
  const nifColaborador = collaborator?.nif ?? "[Número]";
  const cargo = collaborator?.cargo ?? "[Inserir Cargo, ex: Programador Full-Stack]";
  const morada = "[Morada Completa]";
  const bi = "[BI / Cartão de Cidadão / Passaporte]";
  const biNumero = "[Número]";
  const biValidade = "[Data]";
  const dataAdmissao = collaborator?.dataAdmissao ?? "[Data de Início]";
  const salarioBase = collaborator
    ? moneyAoa(collaborator.salarioBaseAoa)
    : "[Valor Numérico] [Moeda]";
  const salarioExtenso = "[Valor em Extenso]";
  const empName = branding?.displayName ?? "[Nome da Empresa/Empregador]";
  const empLegal =
    branding?.legalName && branding.legalName !== empName
      ? ` (${branding.legalName})`
      : "";
  const moradaEmp = branding?.address?.trim() || "[Morada Completa]";
  const nifEmp = branding?.taxId?.trim() || "[Número]";
  const localTrabalho =
    branding?.address?.split("·")[0]?.trim() || "[Cidade/Localidade]";
  const dataLonga = new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return `
CONTRATO DE TRABALHO A TERMO CERTO

ENTRE:
EMPRESA: ${empName}${empLegal}, com sede em ${moradaEmp}, NIF ${nifEmp}, aqui representada por [Nome do Representante], na qualidade de [Cargo], adiante designada como Primeira Outorgante ou Empregadora.

E:
COLABORADOR: ${nomeColaborador}, [Estado Civil], residente em ${morada}, titular do ${bi} nº ${biNumero}, válido até ${biValidade}, com o NIF ${nifColaborador}, adiante designado como Segundo Outorgante ou Trabalhador.

É livremente e de boa-fé celebrado o presente Contrato de Trabalho, que se rege pelas cláusulas seguintes:

Cláusula 1ª (Objeto e Categoria Profissional)
O Segundo Outorgante é contratado para exercer as funções correspondentes à categoria profissional de ${cargo}, competindo-lhe desempenhar as tarefas inerentes a essa função e as que superiormente lhe sejam determinadas.

Cláusula 2ª (Local e Horário de Trabalho)
O local de trabalho situa-se nas instalações da Empregadora em ${localTrabalho}, podendo o trabalho ser prestado em regime de [Presencial / Teletrabalho / Híbrido].
O horário de trabalho será de [Número, ex: 40] horas semanais, distribuídas de segunda a sexta-feira, nos termos dos horários em vigor na empresa.

Cláusula 3ª (Prazo e Justificação)
O presente contrato é celebrado pelo prazo de [Número, ex: 6 ou 12] meses, com início em ${dataAdmissao} e termo em [Data de Fim].
O contrato é celebrado a termo certo devido ao seguinte motivo de força legal: [Exemplo: Acréscimo excecional de atividade da empresa / Lançamento de novo projeto de software].

Cláusula 4ª (Período de Experiência)
Os primeiros [Número, ex: 30, 60, 90] dias de execução do contrato correspondem ao período de experiência, durante o qual qualquer uma das partes pode rescindir o contrato sem aviso prévio e sem direito a indemnização.

Cláusula 5ª (Remuneração e Benefícios)
Como contraprestação pelo seu trabalho, o Segundo Outorgante receberá o salário bruto mensal de ${salarioExtenso} (${salarioBase}), sujeito aos descontos legais obrigatórios.
O Trabalhador terá direito a subsídio de alimentação no valor de [Valor] por cada dia útil de trabalho efetivo.

Cláusula 6ª (Férias)
O Segundo Outorgante tem direito ao gozo de um período de férias anual nos termos da lei em vigor, devendo a sua marcação ser acordada previamente com a Empregadora.

Cláusula 7ª (Confidencialidade e Não-Divulgação)
O Segundo Outorgante obriga-se a guardar estrito sigilo profissional sobre todas as informações, dados técnicos, códigos-fonte, segredos comerciais ou dados de clientes a que tenha acesso em virtude das suas funções, mesmo após a cessação deste contrato.

Cláusula 8ª (Cessação e Resolução)
A denúncia ou rescisão do presente contrato rege-se pelos prazos de aviso prévio fixados na legislação laboral aplicável.

As partes aceitam o presente contrato, feito em duplicado, ficando um exemplar em posse de cada outorgante.

[Localidade], ${dataLonga}.

A Primeira Outorgante (Empregadora)
O Segundo Outorgante (Trabalhador)
`.trim();
}

export function AdminRhManager() {
  const [collaborators, setCollaborators] = useState<RhCollaboratorView[]>([]);
  const [documents, setDocuments] = useState<RhDocumentView[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<
    import("@/lib/api-client").RhAttendanceView[]
  >([]);
  const [dailyRecords, setDailyRecords] = useState<
    import("@/lib/api-client").RhDailyAttendanceView[]
  >([]);
  const [payroll, setPayroll] = useState<import("@/lib/api-client").RhPayrollLine[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<
    import("@/lib/api-client").RhSalaryPaymentView[]
  >([]);
  const [salaryBalances, setSalaryBalances] = useState<
    import("@/lib/api-client").RhSalaryBalanceLine[]
  >([]);
  const [orgChart, setOrgChart] = useState<{ gestor: string; equipa: string[] }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(currentMonthKey);
  const [periodKey, setPeriodKey] = useState("");
  const [quickDate, setQuickDate] = useState(todayIsoDate);
  const [activeTab, setActiveTab] = useState<RhTabId>("equipa");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [punchingUserId, setPunchingUserId] = useState<string | null>(null);

  const [collabModalOpen, setCollabModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const [profileUserId, setProfileUserId] = useState("");
  const [collabNif, setCollabNif] = useState("");
  const [collabIban, setCollabIban] = useState("");
  const [collabCargo, setCollabCargo] = useState("");
  const [collabDepartamento, setCollabDepartamento] = useState("");
  const [collabGestor, setCollabGestor] = useState("");
  const [collabAdmissao, setCollabAdmissao] = useState("");
  const [collabSalario, setCollabSalario] = useState("");
  const [collabEstado, setCollabEstado] = useState<RhContractStatus>("Ativo");
  const [collabError, setCollabError] = useState<string | null>(null);

  const [docColaboradorId, setDocColaboradorId] = useState("");
  const [docTipo, setDocTipo] = useState<RhDocumentType>("BI");
  const [docReferencia, setDocReferencia] = useState("");
  const [docValidade, setDocValidade] = useState("");
  const [docEstado, setDocEstado] = useState<DocumentStatus>("Carregado");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docFilterUserId, setDocFilterUserId] = useState("");
  const [docError, setDocError] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const [paymentUserId, setPaymentUserId] = useState("");
  const [paymentTipo, setPaymentTipo] = useState<RhSalaryPaymentType>("salario");
  const [paymentValor, setPaymentValor] = useState("");
  const [paymentData, setPaymentData] = useState(todayIsoDate);
  const [paymentReferencia, setPaymentReferencia] = useState("");
  const [paymentNotas, setPaymentNotas] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await getRhOverview(selectedPeriod);
      setCollaborators(overview.collaborators);
      setDocuments(overview.documents);
      setAttendanceRows(overview.attendance);
      setDailyRecords(overview.dailyAttendance ?? []);
      setPayroll(overview.payroll ?? []);
      setSalaryPayments(overview.salaryPayments ?? []);
      setSalaryBalances(overview.salaryBalances ?? []);
      setOrgChart(overview.orgChart);
      setPeriodKey(overview.periodKey);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Não foi possível carregar os dados de RH.",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const selectedProfile = useMemo(
    () => collaborators.find((c) => c.userId === profileUserId),
    [collaborators, profileUserId],
  );

  const totalColaboradores = collaborators.length;
  const ativos = collaborators.filter((m) => m.estadoContrato === "Ativo").length;
  const pendenciasDocumentais = documents.filter(
    (d) => d.estado !== "Carregado",
  ).length;
  const faltasInjustificadasTotal = attendanceRows.reduce(
    (acc, row) => acc + row.faltasInjustificadas,
    0,
  );
  const totalDescontoFaltas = payroll.reduce(
    (acc, row) => acc + row.descontoFaltasAoa,
    0,
  );
  const colaboradoresEmAtraso = salaryBalances.filter(
    (line) => line.situacao === "em_atraso" || line.situacao === "parcial",
  ).length;
  const totalSaldoPendente = salaryBalances.reduce(
    (acc, line) => acc + line.saldoPendenteAoa,
    0,
  );

  const dailyByUserForQuickDate = useMemo(() => {
    const map = new Map<string, RhDailyAttendanceView>();
    for (const row of dailyRecords) {
      if (row.date === quickDate) map.set(row.userId, row);
    }
    return map;
  }, [dailyRecords, quickDate]);

  const contratosDocs = useMemo(
    () => documents.filter((d) => d.tipo === "Contrato"),
    [documents],
  );

  const filteredDocuments = useMemo(
    () =>
      docFilterUserId
        ? documents.filter((d) => d.userId === docFilterUserId)
        : documents,
    [documents, docFilterUserId],
  );

  const emFeriasRows = useMemo(
    () =>
      collaborators
        .filter((c) => c.estadoContrato === "Em férias")
        .map((c) => {
          const ponto = attendanceRows.find((a) => a.userId === c.userId);
          return {
            colaborador: c.nome,
            departamento: c.departamento,
            saldoFeriasDias: ponto?.saldoFeriasDias ?? 0,
            dataAdmissao: c.dataAdmissao,
          };
        }),
    [collaborators, attendanceRows],
  );

  function fillProfileForm(collaborator: RhCollaboratorView) {
    setProfileUserId(collaborator.userId);
    setCollabNif(collaborator.nif);
    setCollabIban(collaborator.iban);
    setCollabCargo(collaborator.cargo);
    setCollabDepartamento(collaborator.departamento);
    setCollabGestor(collaborator.gestorDireto);
    setCollabAdmissao(collaborator.dataAdmissao);
    setCollabSalario(
      collaborator.salarioBaseAoa > 0 ? String(collaborator.salarioBaseAoa) : "",
    );
    setCollabEstado(collaborator.estadoContrato);
    setCollabError(null);
  }

  function openProfileModal(userId?: string) {
    const target = userId ?? collaborators[0]?.userId ?? "";
    const collaborator = collaborators.find((c) => c.userId === target);
    if (collaborator) {
      fillProfileForm(collaborator);
    } else {
      setProfileUserId("");
    setCollabNif("");
    setCollabIban("");
    setCollabCargo("");
    setCollabDepartamento("");
    setCollabGestor("");
    setCollabAdmissao("");
    setCollabSalario("");
    setCollabEstado("Ativo");
    setCollabError(null);
    }
    setCollabModalOpen(true);
  }

  function handleProfileUserChange(userId: string) {
    const collaborator = collaborators.find((c) => c.userId === userId);
    if (collaborator) fillProfileForm(collaborator);
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setCollabError(null);
    if (!profileUserId) {
      setCollabError("Seleciona um colaborador.");
      return;
    }
    const salario = Number(collabSalario);
    if (!Number.isFinite(salario) || salario < 0) {
      setCollabError("Indica um salário base válido.");
      return;
    }
    setSaving(true);
    try {
      await upsertRhProfile(profileUserId, {
      nif: collabNif.trim(),
      iban: collabIban.trim(),
      cargo: collabCargo.trim(),
      departamento: collabDepartamento.trim(),
      gestorDireto: collabGestor.trim(),
        dataAdmissao: collabAdmissao.trim() || undefined,
      salarioBaseAoa: salario,
      estadoContrato: collabEstado,
      });
    setCollabModalOpen(false);
      await loadOverview();
    } catch (err) {
      setCollabError(
        err instanceof Error ? err.message : "Não foi possível guardar a ficha RH.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateDocument(e: FormEvent) {
    e.preventDefault();
    setDocError(null);
    if (!docColaboradorId) {
      setDocError("Seleciona um colaborador válido.");
      return;
    }
    if (!docReferencia.trim()) {
      setDocError("A referência do documento é obrigatória.");
      return;
    }
    if (!docFile) {
      setDocError("Anexa o ficheiro do documento (PNG, JPG ou PDF).");
      return;
    }
    setSaving(true);
    try {
      await createRhDocument(
        {
          userId: docColaboradorId,
      tipo: docTipo,
      referencia: docReferencia.trim(),
          validade: docValidade.trim() || undefined,
      estado: docEstado,
        },
        docFile,
      );
    setDocModalOpen(false);
    setDocReferencia("");
    setDocValidade("");
    setDocEstado("Carregado");
      setDocFile(null);
      await loadOverview();
    } catch (err) {
      setDocError(
        err instanceof Error ? err.message : "Não foi possível guardar o documento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function openDocument(doc: RhDocumentView) {
    if (!doc.hasFile) return;
    setOpeningDocId(doc.id);
    try {
      const blob = await fetchRhDocumentFileBlob(doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível abrir o anexo.",
      );
    } finally {
      setOpeningDocId(null);
    }
  }

  async function handleDeleteDocument(doc: RhDocumentView) {
    if (
      !window.confirm(
        `Remover o documento "${doc.referencia}" de ${doc.colaborador}?`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteRhDocument(doc.id);
      await loadOverview();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível remover o documento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDailyPunch(userId: string, punch: "entrada" | "saida") {
    setPunchingUserId(userId);
    try {
      await registerRhDailyPunch({ userId, date: quickDate, punch });
      await loadOverview();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível registar o ponto.",
      );
    } finally {
      setPunchingUserId(null);
    }
  }

  async function handleDailyAbsence(userId: string, status: RhDayStatus) {
    setPunchingUserId(userId);
    try {
      await upsertRhDailyAttendance({ userId, date: quickDate, status });
      await loadOverview();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível registar a falta.",
      );
    } finally {
      setPunchingUserId(null);
    }
  }

  function openPaymentModal(
    userId?: string,
    tipo: RhSalaryPaymentType = "salario",
    valor?: number,
  ) {
    const target = userId ?? collaborators[0]?.userId ?? "";
    setPaymentUserId(target);
    setPaymentTipo(tipo);
    setPaymentValor(valor && valor > 0 ? String(valor) : "");
    setPaymentData(todayIsoDate());
    setPaymentReferencia("");
    setPaymentNotas("");
    setPaymentError(null);
    setPaymentModalOpen(true);
  }

  async function handleCreatePayment(e: FormEvent) {
    e.preventDefault();
    setPaymentError(null);
    if (!paymentUserId) {
      setPaymentError("Seleciona um colaborador.");
      return;
    }
    const valor = Number(paymentValor);
    if (!Number.isFinite(valor) || valor <= 0) {
      setPaymentError("Indica um valor válido.");
      return;
    }
    setSaving(true);
    try {
      await createRhSalaryPayment({
        userId: paymentUserId,
        periodKey: selectedPeriod,
        tipo: paymentTipo,
        valorAoa: valor,
        dataPagamento: paymentData,
        referencia: paymentReferencia.trim() || undefined,
        notas: paymentNotas.trim() || undefined,
      });
      setPaymentModalOpen(false);
      await loadOverview();
    } catch (err) {
      setPaymentError(
        err instanceof Error ? err.message : "Não foi possível registar o pagamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePayRemaining(line: RhSalaryBalanceLine) {
    if (line.saldoPendenteAoa <= 0) return;
    setSaving(true);
    try {
      await createRhSalaryPayment({
        userId: line.userId,
        periodKey: selectedPeriod,
        tipo: "salario",
        valorAoa: line.saldoPendenteAoa,
        dataPagamento: todayIsoDate(),
        referencia: "Pagamento do saldo pendente",
      });
      await loadOverview();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível registar o pagamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePayment(payment: RhSalaryPaymentView) {
    if (!window.confirm(`Remover pagamento de ${moneyAoa(payment.valorAoa)}?`)) return;
    setSaving(true);
    try {
      await deleteRhSalaryPayment(payment.id);
      await loadOverview();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível remover o pagamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  function printContractsList() {
    if (typeof window === "undefined") return;
    const rows = contratosDocs
      .map(
        (d) =>
          `<tr><td>${d.colaborador}</td><td>${d.referencia}</td><td>${d.validade}</td><td>${d.estado}</td></tr>`,
      )
      .join("");
    void rhPrintHtml(
      "Lista de contratos",
      `<table><thead><tr><th>Colaborador</th><th>Contrato</th><th>Validade</th><th>Estado</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='4'>Sem contratos.</td></tr>"}</tbody></table>`,
      "Recursos Humanos",
    );
  }

  function printAttendanceList() {
    if (typeof window === "undefined") return;
    const rows = attendanceRows
      .map(
        (r) =>
          `<tr><td>${r.colaborador}</td><td>${r.diasTrabalhados}</td><td>${r.faltasJustificadas}</td><td>${r.faltasInjustificadas}</td></tr>`,
      )
      .join("");
    void rhPrintHtml(
      "Resumo mensal de assiduidade",
      `<table><thead><tr><th>Colaborador</th><th>Dias presentes</th><th>Faltas Just.</th><th>Faltas Injust.</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='4'>Sem registos.</td></tr>"}</tbody></table>`,
      `Recursos Humanos · ${periodKey}`,
    );
  }

  async function exportContractsPdf() {
    const { doc, branding, startY } = await createRhPdf(
      "Lista de contratos",
      `Gerado em ${todayPtDate()}`,
    );
    autoTable(doc, {
      startY,
      head: [["Colaborador", "Referência", "Validade", "Estado"]],
      body:
        contratosDocs.length > 0
          ? contratosDocs.map((d) => [d.colaborador, d.referencia, d.validade, d.estado])
          : [["Sem contratos", "-", "-", "-"]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [113, 63, 18] },
    });
    paintJsPdfAgtFooter(doc, branding);
    doc.save(`rh-contratos_${todayPtDate().replaceAll("/", "-")}.pdf`);
  }

  async function exportContractTemplatePdf() {
    const collaborator = collaborators[0];
    const { doc, branding, startY } = await createRhPdf(
      "Modelo de contrato de trabalho",
      "Minuta RH (editar campos entre [ ])",
    );
    const template = contractTemplateText(collaborator, branding);
    const lines = doc.splitTextToSize(template, 182);
    let y = startY;
    for (const line of lines) {
      if (y > 282) {
        doc.addPage();
        y = 16;
      }
      doc.text(line, 14, y);
      y += 4.7;
    }
    paintJsPdfAgtFooter(doc, branding);
    doc.save(`rh-modelo-contrato_${todayPtDate().replaceAll("/", "-")}.pdf`);
  }

  async function exportSalarySheetPdf() {
    const { doc, branding, startY } = await createRhPdf(
      "Folha salarial (INSS Angola)",
      `Período ${periodKey} · desconto automático por faltas injustificadas`,
    );
    autoTable(doc, {
      startY,
      head: [[
        "Colaborador",
        "Salário Base",
        "Faltas Injust.",
        "Desconto",
        "Salário Ajust.",
        "INSS 3%",
        "Líquido",
      ]],
      body:
        payroll.length > 0
          ? payroll.map((line) => [
              line.colaborador,
              moneyAoa(line.salarioBaseAoa),
              String(line.faltasInjustificadas),
              moneyAoa(line.descontoFaltasAoa),
              moneyAoa(line.salarioAjustadoAoa),
              moneyAoa(line.inssTrabalhadorAoa),
              moneyAoa(line.liquidoAntesIrtAoa),
            ])
          : [["Sem dados", "-", "-", "-", "-", "-", "-"]],
      styles: { fontSize: 7 },
      headStyles: { fillColor: [113, 63, 18] },
    });
    const endY = (doc as DocWithFinal).lastAutoTable?.finalY ?? 40;
    doc.setFontSize(9);
    doc.text(
      "Desconto = (salário base ÷ dias úteis do mês) × faltas injustificadas. Sem IRT.",
      14,
      endY + 8,
    );
    paintJsPdfAgtFooter(doc, branding);
    doc.save(`rh-folha-salarial_${periodKey}.pdf`);
  }

  async function exportFeriasPdf() {
    const { doc, branding, startY } = await createRhPdf(
      "Lista de férias e saldo",
      `Registos em férias: ${emFeriasRows.length}`,
    );
    autoTable(doc, {
      startY,
      head: [["Colaborador", "Departamento", "Saldo (dias)", "Admissão"]],
      body:
        emFeriasRows.length > 0
          ? emFeriasRows.map((r) => [r.colaborador, r.departamento, String(r.saldoFeriasDias), r.dataAdmissao])
          : [["Sem colaboradores em férias", "-", "-", "-"]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [113, 63, 18] },
    });
    paintJsPdfAgtFooter(doc, branding);
    doc.save(`rh-ferias_${todayPtDate().replaceAll("/", "-")}.pdf`);
  }

  async function exportAttendanceCsv() {
    const branding = await fetchDocumentBranding();
    const headerRows = buildCsvCompanyHeaderRows(branding, "Livro de ponto RH");
    const dataCsv = toCsv([
      ["Colaborador", "Dias Presentes", "Faltas Justificadas", "Faltas Injustificadas"],
      ...attendanceRows.map((r) => [
        r.colaborador,
        String(r.diasTrabalhados),
        String(r.faltasJustificadas),
        String(r.faltasInjustificadas),
      ]),
    ]);
    downloadTextFile(
      "rh-ponto.csv",
      `\uFEFF${headerRows.join("\n")}\n${dataCsv}`,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <RhPageHeader
        periodKey={periodKey}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        linkSlot={
          <Link href={ROUTES.admin.utilizadores} className="text-amber-300 hover:underline">
            Utilizadores
          </Link>
        }
      />

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {loadError}
          <button type="button" onClick={() => void loadOverview()} className={`${rhBtnGhost} ml-3 mt-2 sm:mt-0`}>
            Tentar novamente
            </button>
          </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-white/[0.07] bg-zinc-900/40 px-6 py-12 text-center text-sm text-zinc-400">
          A carregar dados de RH…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <RhKpi label="Colaboradores" value={String(totalColaboradores)} />
            <RhKpi label="Ativos" value={String(ativos)} tone="success" />
            <RhKpi label="Docs pendentes" value={String(pendenciasDocumentais)} tone="warning" />
            <RhKpi label="Salário pendente" value={moneyAoa(totalSaldoPendente)} tone="danger" />
            <RhKpi label="Faltas injust." value={String(faltasInjustificadasTotal)} tone="amber" />
          </div>

          <RhTabs active={activeTab} onChange={setActiveTab} />

          <RhPanels
            activeTab={activeTab}
            periodKey={periodKey || selectedPeriod}
            collaborators={collaborators}
            orgChart={orgChart}
            documents={filteredDocuments}
            docFilterUserId={docFilterUserId}
            onDocFilterChange={setDocFilterUserId}
            attendanceRows={attendanceRows}
            quickDate={quickDate}
            onQuickDateChange={setQuickDate}
            dailyByUser={dailyByUserForQuickDate}
            punchingUserId={punchingUserId}
            payroll={payroll}
            salaryBalances={salaryBalances}
            salaryPayments={salaryPayments}
            colaboradoresEmAtraso={colaboradoresEmAtraso}
            totalSaldoPendente={totalSaldoPendente}
            saving={saving}
            openingDocId={openingDocId}
            onOpenProfile={openProfileModal}
            onOpenDocument={openDocument}
            onDeleteDocument={handleDeleteDocument}
            onOpenDocModal={() => {
                setDocError(null);
              setDocColaboradorId(collaborators[0]?.userId ?? "");
              setDocFile(null);
                setDocModalOpen(true);
              }}
            onDailyPunch={handleDailyPunch}
            onDailyAbsence={handleDailyAbsence}
            onOpenPaymentModal={openPaymentModal}
            onPayRemaining={handlePayRemaining}
            onDeletePayment={handleDeletePayment}
            onExportContractTemplate={() => void exportContractTemplatePdf()}
            onExportContracts={() => void exportContractsPdf()}
            onPrintContracts={printContractsList}
            onExportSalaryPdf={() => void exportSalarySheetPdf()}
            onExportFeriasPdf={() => void exportFeriasPdf()}
            onExportAttendanceCsv={() => void exportAttendanceCsv()}
            onPrintAttendance={printAttendanceList}
          />
        </>
      )}

      {collabModalOpen ? (
        <RhModal title="Ficha RH do colaborador" onClose={() => setCollabModalOpen(false)}>
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
              <div>
              <label className={rhLabelClass}>Colaborador</label>
              <select
                className={rhInputClass}
                value={profileUserId}
                onChange={(e) => handleProfileUserChange(e.target.value)}
                required
              >
                <option value="">Selecionar…</option>
                {collaborators.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.nome} ({ROLE_LABELS[c.role]})
                  </option>
                ))}
              </select>
              </div>
            {selectedProfile ? (
              <div className="rounded-xl border border-white/[0.06] bg-zinc-950/50 px-4 py-3 text-sm text-zinc-400">
                <p className="font-medium text-zinc-200">{selectedProfile.nome}</p>
                <p className="mt-1">{selectedProfile.email}</p>
                <p>{selectedProfile.telefone ?? "Sem telefone na conta"}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Nome, email e telefone são geridos em Utilizadores.
                </p>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={rhLabelClass}>NIF</label>
                <input className={rhInputClass} value={collabNif} onChange={(e) => setCollabNif(e.target.value)} />
              </div>
              <div>
                <label className={rhLabelClass}>IBAN</label>
                <input className={rhInputClass} value={collabIban} onChange={(e) => setCollabIban(e.target.value)} />
              </div>
              <div>
                <label className={rhLabelClass}>Cargo</label>
                <input className={rhInputClass} value={collabCargo} onChange={(e) => setCollabCargo(e.target.value)} required />
              </div>
              <div>
                <label className={rhLabelClass}>Departamento</label>
                <input className={rhInputClass} value={collabDepartamento} onChange={(e) => setCollabDepartamento(e.target.value)} required />
              </div>
              <div>
                <label className={rhLabelClass}>Gestor Direto</label>
                <input className={rhInputClass} value={collabGestor} onChange={(e) => setCollabGestor(e.target.value)} placeholder="Ex.: Direção Geral" />
              </div>
              <div>
                <label className={rhLabelClass}>Data de admissão</label>
                <input className={rhInputClass} value={collabAdmissao} onChange={(e) => setCollabAdmissao(e.target.value)} placeholder="dd/mm/aaaa" />
              </div>
              <div>
                <label className={rhLabelClass}>Salário base (AOA)</label>
                <input type="number" min="0" className={rhInputClass} value={collabSalario} onChange={(e) => setCollabSalario(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={rhLabelClass}>Estado contratual</label>
                <select className={rhInputClass} value={collabEstado} onChange={(e) => setCollabEstado(e.target.value as RhContractStatus)}>
                  <option value="Ativo">Ativo</option>
                  <option value="Em férias">Em férias</option>
                  <option value="Licença">Licença</option>
                </select>
              </div>
            </div>
            {collabError ? <p className="text-sm text-red-300">{collabError}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={rhBtnGhost} onClick={() => setCollabModalOpen(false)}>Cancelar</button>
              <button type="submit" className={rhBtnPrimary} disabled={saving}>
                {saving ? "A guardar…" : "Guardar ficha RH"}
              </button>
            </div>
          </form>
        </RhModal>
      ) : null}

      {docModalOpen ? (
        <RhModal title="Anexar documento do colaborador" onClose={() => setDocModalOpen(false)}>
          <form onSubmit={handleCreateDocument} className="flex flex-col gap-4">
            <div>
              <label className={rhLabelClass}>Colaborador</label>
              <select className={rhInputClass} value={docColaboradorId} onChange={(e) => setDocColaboradorId(e.target.value)}>
                {collaborators.map((c) => (
                  <option key={c.userId} value={c.userId}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={rhLabelClass}>Tipo</label>
                <select className={rhInputClass} value={docTipo} onChange={(e) => setDocTipo(e.target.value as RhDocumentType)}>
                  <option value="BI">BI</option>
                  <option value="NIF">NIF</option>
                  <option value="Certificado">Certificado</option>
                  <option value="Extrato">Extrato bancário</option>
                  <option value="Contrato">Contrato</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <label className={rhLabelClass}>Estado</label>
                <select className={rhInputClass} value={docEstado} onChange={(e) => setDocEstado(e.target.value as DocumentStatus)}>
                  <option value="Carregado">Carregado</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Expirado">Expirado</option>
                </select>
              </div>
            </div>
            <div>
              <label className={rhLabelClass}>Referência</label>
              <input className={rhInputClass} value={docReferencia} onChange={(e) => setDocReferencia(e.target.value)} placeholder="Nº BI, contrato, etc." required />
            </div>
            <div>
              <label className={rhLabelClass}>Validade</label>
              <input className={rhInputClass} value={docValidade} onChange={(e) => setDocValidade(e.target.value)} placeholder="aaaa-mm-dd" />
            </div>
            <div>
              <label className={rhLabelClass}>Ficheiro anexo</label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                className={`${rhInputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-zinc-950`}
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                required
              />
              <p className="mt-2 text-xs text-zinc-500">
                PNG, JPG ou PDF — máximo 10 MB.
                {docFile ? ` Selecionado: ${docFile.name}` : ""}
              </p>
            </div>
            {docError ? <p className="text-sm text-red-300">{docError}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={rhBtnGhost} onClick={() => setDocModalOpen(false)}>Cancelar</button>
              <button type="submit" className={rhBtnPrimary} disabled={saving}>
                {saving ? "A guardar…" : "Anexar documento"}
              </button>
            </div>
          </form>
        </RhModal>
      ) : null}

      {paymentModalOpen ? (
        <RhModal title="Registar pagamento de salário" onClose={() => setPaymentModalOpen(false)}>
          <form onSubmit={handleCreatePayment} className="flex flex-col gap-4">
            <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200/90">
              O valor será registado automaticamente como saída no fluxo de caixa (categoria RH / Salários).
            </p>
            <div>
              <label className={rhLabelClass}>Colaborador</label>
              <select
                className={rhInputClass}
                value={paymentUserId}
                onChange={(e) => setPaymentUserId(e.target.value)}
                required
              >
                <option value="">Selecionar…</option>
                {collaborators.map((c) => (
                  <option key={c.userId} value={c.userId}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={rhLabelClass}>Tipo</label>
                <select
                  className={rhInputClass}
                  value={paymentTipo}
                  onChange={(e) => setPaymentTipo(e.target.value as RhSalaryPaymentType)}
                >
                  <option value="salario">Pagamento de salário</option>
                  <option value="adiantamento">Adiantamento</option>
                </select>
            </div>
              <div>
                <label className={rhLabelClass}>Período</label>
                <input type="month" className={rhInputClass} value={selectedPeriod} readOnly />
            </div>
              <div>
                <label className={rhLabelClass}>Valor (AOA)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={rhInputClass}
                  value={paymentValor}
                  onChange={(e) => setPaymentValor(e.target.value)}
                  required
                />
    </div>
              <div>
                <label className={rhLabelClass}>Data do pagamento</label>
                <input
                  type="date"
                  className={rhInputClass}
                  value={paymentData}
                  onChange={(e) => setPaymentData(e.target.value)}
                  required
                />
    </div>
      </div>
            <div>
              <label className={rhLabelClass}>Referência (transferência, recibo, etc.)</label>
              <input
                className={rhInputClass}
                value={paymentReferencia}
                onChange={(e) => setPaymentReferencia(e.target.value)}
                placeholder="Opcional"
              />
          </div>
    <div>
              <label className={rhLabelClass}>Notas</label>
      <input
                className={rhInputClass}
                value={paymentNotas}
                onChange={(e) => setPaymentNotas(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            {paymentError ? <p className="text-sm text-red-300">{paymentError}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={rhBtnGhost} onClick={() => setPaymentModalOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className={rhBtnPrimary} disabled={saving}>
                {saving ? "A guardar…" : "Registar pagamento"}
              </button>
            </div>
          </form>
        </RhModal>
      ) : null}
    </div>
  );
}
