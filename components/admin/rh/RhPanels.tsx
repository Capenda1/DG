"use client";

import Link from "next/link";
import type {
  RhCollaboratorView,
  RhDailyAttendanceView,
  RhDocumentView,
  RhPayrollLine,
  RhSalaryBalanceLine,
  RhSalaryPaymentView,
} from "@/lib/api-client";
import { ROUTES } from "@/lib/routes";
import {
  RhBadge,
  RhCard,
  RhKpi,
  RhTable,
  RhTd,
  RhTh,
  rhBtnGhost,
  rhBtnPrimarySm,
  rhBtnQuick,
  rhInputClass,
  rhLabelClass,
} from "./rh-ui";
import type { RhTabId } from "./rh-utils";
import {
  ROLE_LABELS,
  contractStatusBadge,
  dayStatusBadge,
  dayStatusLabel,
  documentStatusBadge,
  formatBytes,
  moneyAoa,
  salarySituationBadge,
  salarySituationLabel,
} from "./rh-utils";

function RhNoCollaboratorsMessage() {
  return (
    <>
      Sem colaboradores. Cria contas em{" "}
      <Link href={ROUTES.admin.utilizadores} className="text-amber-300 hover:underline">
        Utilizadores
      </Link>
      .
    </>
  );
}

type AttendanceRow = {
  id: string;
  colaborador: string;
  diasTrabalhados: number;
  faltasJustificadas: number;
  faltasInjustificadas: number;
};

export type RhPanelsProps = {
  activeTab: RhTabId;
  periodKey: string;
  collaborators: RhCollaboratorView[];
  orgChart: { gestor: string; equipa: string[] }[];
  documents: RhDocumentView[];
  docFilterUserId: string;
  onDocFilterChange: (userId: string) => void;
  attendanceRows: AttendanceRow[];
  quickDate: string;
  onQuickDateChange: (date: string) => void;
  dailyByUser: Map<string, RhDailyAttendanceView>;
  punchingUserId: string | null;
  payroll: RhPayrollLine[];
  salaryBalances: RhSalaryBalanceLine[];
  salaryPayments: RhSalaryPaymentView[];
  colaboradoresEmAtraso: number;
  totalSaldoPendente: number;
  saving: boolean;
  openingDocId: string | null;
  onOpenProfile: (userId?: string) => void;
  onOpenDocument: (doc: RhDocumentView) => void;
  onDeleteDocument: (doc: RhDocumentView) => void;
  onOpenDocModal: () => void;
  onDailyPunch: (userId: string, punch: "entrada" | "saida") => void;
  onDailyAbsence: (userId: string, status: "falta_justificada" | "falta_injustificada") => void;
  onOpenPaymentModal: (userId?: string, tipo?: "salario" | "adiantamento") => void;
  onPayRemaining: (line: RhSalaryBalanceLine) => void;
  onDeletePayment: (payment: RhSalaryPaymentView) => void;
  onExportContractTemplate: () => void;
  onExportContracts: () => void;
  onPrintContracts: () => void;
  onExportSalaryPdf: () => void;
  onExportFeriasPdf: () => void;
  onExportAttendanceCsv: () => void;
  onPrintAttendance: () => void;
};

export function RhPanels(props: RhPanelsProps) {
  switch (props.activeTab) {
    case "equipa":
      return <RhTeamPanel {...props} />;
    case "documentos":
      return <RhDocumentsPanel {...props} />;
    case "ponto":
      return <RhAttendancePanel {...props} />;
    case "salarios":
      return <RhSalaryPanel {...props} />;
    default:
      return null;
  }
}

function RhTeamPanel({
  collaborators,
  orgChart,
  onOpenProfile,
  onExportContractTemplate,
  onExportContracts,
  onPrintContracts,
}: RhPanelsProps) {
  return (
    <div className="space-y-5">
      <RhCard
        title="Colaboradores"
        description="Fichas RH ligadas às contas internas."
        actions={
          <>
            <button type="button" className={rhBtnGhost} onClick={onExportContractTemplate}>
              Modelo PDF
            </button>
            <button type="button" className={rhBtnGhost} onClick={onExportContracts}>
              Contratos PDF
            </button>
            <button type="button" className={rhBtnGhost} onClick={onPrintContracts}>
              Imprimir
            </button>
            <button
              type="button"
              className={rhBtnPrimarySm}
              disabled={collaborators.length === 0}
              onClick={() => onOpenProfile()}
            >
              Editar ficha
            </button>
          </>
        }
      >
        <RhTable
          isEmpty={collaborators.length === 0}
          empty={<RhNoCollaboratorsMessage />}
        >
          {collaborators.length > 0 ? (
            <>
              <thead>
                <tr>
                  <RhTh>Nome</RhTh>
                  <RhTh>Cargo</RhTh>
                  <RhTh>Contacto</RhTh>
                  <RhTh>Salário</RhTh>
                  <RhTh>Estado</RhTh>
                  <RhTh />
                </tr>
              </thead>
              <tbody>
                {collaborators.map((member) => (
                  <tr key={member.userId} className="hover:bg-white/[0.02]">
                    <RhTd className="font-medium text-white">
                      {member.nome}
                      <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                        {ROLE_LABELS[member.role]}
                        {!member.hasRhProfile ? " · Sem ficha" : ""}
                      </span>
                    </RhTd>
                    <RhTd>
                      <span className="block">{member.cargo}</span>
                      <span className="text-xs text-zinc-500">{member.departamento}</span>
                    </RhTd>
                    <RhTd className="text-xs">
                      <span className="block">{member.telefone ?? "—"}</span>
                      <span className="text-zinc-500">{member.email}</span>
                    </RhTd>
                    <RhTd>
                      {member.salarioBaseAoa > 0 ? moneyAoa(member.salarioBaseAoa) : "—"}
                    </RhTd>
                    <RhTd>
                      <RhBadge className={contractStatusBadge(member.estadoContrato)}>
                        {member.estadoContrato}
                      </RhBadge>
                    </RhTd>
                    <RhTd>
                      <button
                        type="button"
                        className="text-xs font-medium text-amber-300 hover:underline"
                        onClick={() => onOpenProfile(member.userId)}
                      >
                        Editar
                      </button>
                    </RhTd>
                  </tr>
                ))}
              </tbody>
            </>
          ) : null}
        </RhTable>
      </RhCard>

      <RhCard title="Organograma" description="Quem reporta a quem.">
        {orgChart.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Define o gestor directo nas fichas RH para gerar a hierarquia.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {orgChart.map((node) => (
              <div
                key={node.gestor}
                className="rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3"
              >
                <p className="text-sm font-semibold text-amber-300">{node.gestor}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {node.equipa.length > 0 ? node.equipa.join(", ") : "Sem equipa"}
                </p>
              </div>
            ))}
          </div>
        )}
      </RhCard>
    </div>
  );
}

function RhDocumentsPanel({
  collaborators,
  documents,
  docFilterUserId,
  onDocFilterChange,
  saving,
  openingDocId,
  onOpenDocument,
  onDeleteDocument,
  onOpenDocModal,
}: RhPanelsProps) {
  return (
    <RhCard
      title="Documentos"
      description="BI, certificados, extratos e contratos anexados."
      actions={
        <button
          type="button"
          className={rhBtnPrimarySm}
          disabled={collaborators.length === 0}
          onClick={onOpenDocModal}
        >
          + Anexar
        </button>
      }
    >
      <div className="mb-4 max-w-xs">
        <label className={rhLabelClass}>Filtrar colaborador</label>
        <select
          className={rhInputClass}
          value={docFilterUserId}
          onChange={(e) => onDocFilterChange(e.target.value)}
        >
          <option value="">Todos</option>
          {collaborators.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <RhTable isEmpty={documents.length === 0} empty="Sem documentos registados.">
        {documents.length > 0 ? (
          <>
            <thead>
              <tr>
                <RhTh>Colaborador</RhTh>
                <RhTh>Tipo</RhTh>
                <RhTh>Referência</RhTh>
                <RhTh>Anexo</RhTh>
                <RhTh>Estado</RhTh>
                <RhTh />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-white/[0.02]">
                  <RhTd>{doc.colaborador}</RhTd>
                  <RhTd>{doc.tipo}</RhTd>
                  <RhTd className="text-zinc-400">{doc.referencia}</RhTd>
                  <RhTd className="text-xs">
                    {doc.hasFile ? (
                      <>
                        <span className="block max-w-[160px] truncate">{doc.fileName}</span>
                        <span className="text-zinc-500">{formatBytes(doc.fileSizeBytes)}</span>
                      </>
                    ) : (
                      <span className="text-amber-400">Sem ficheiro</span>
                    )}
                  </RhTd>
                  <RhTd>
                    <RhBadge className={documentStatusBadge(doc.estado)}>{doc.estado}</RhBadge>
                  </RhTd>
                  <RhTd>
                    <div className="flex gap-2">
                      {doc.hasFile ? (
                        <button
                          type="button"
                          className="text-xs text-amber-300 hover:underline disabled:opacity-50"
                          disabled={openingDocId === doc.id}
                          onClick={() => void onOpenDocument(doc)}
                        >
                          {openingDocId === doc.id ? "A abrir…" : "Ver"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs text-red-300 hover:underline disabled:opacity-50"
                        disabled={saving}
                        onClick={() => void onDeleteDocument(doc)}
                      >
                        Remover
                      </button>
                    </div>
                  </RhTd>
                </tr>
              ))}
            </tbody>
          </>
        ) : null}
      </RhTable>
    </RhCard>
  );
}

function RhAttendancePanel({
  collaborators,
  attendanceRows,
  quickDate,
  onQuickDateChange,
  dailyByUser,
  punchingUserId,
  periodKey,
  onDailyPunch,
  onDailyAbsence,
  onExportAttendanceCsv,
  onPrintAttendance,
}: RhPanelsProps) {
  return (
    <div className="space-y-5">
      <RhCard
        title="Registo do dia"
        description="Entrada, saída ou falta com um clique."
        actions={
          <>
            <button type="button" className={rhBtnGhost} onClick={onExportAttendanceCsv}>
              Exportar CSV
            </button>
            <button type="button" className={rhBtnGhost} onClick={onPrintAttendance}>
              Imprimir
            </button>
          </>
        }
      >
        <div className="mb-4 max-w-[11rem]">
          <label className={rhLabelClass}>Data</label>
          <input
            type="date"
            className={rhInputClass}
            value={quickDate}
            onChange={(e) => onQuickDateChange(e.target.value)}
          />
        </div>

        <RhTable
          isEmpty={collaborators.length === 0}
          empty={<RhNoCollaboratorsMessage />}
        >
          {collaborators.length > 0 ? (
            <>
              <thead>
                <tr>
                  <RhTh>Colaborador</RhTh>
                  <RhTh>Entrada</RhTh>
                  <RhTh>Saída</RhTh>
                  <RhTh>Estado</RhTh>
                  <RhTh>Ações</RhTh>
                </tr>
              </thead>
              <tbody>
                {collaborators.map((member) => {
                  const day = dailyByUser.get(member.userId);
                  const busy = punchingUserId === member.userId;
                  return (
                    <tr key={member.userId} className="hover:bg-white/[0.02]">
                      <RhTd className="font-medium text-white">{member.nome}</RhTd>
                      <RhTd>{day?.entrada ?? "—"}</RhTd>
                      <RhTd>{day?.saida ?? "—"}</RhTd>
                      <RhTd>
                        <RhBadge className={dayStatusBadge(day?.status)}>
                          {dayStatusLabel(day?.status)}
                        </RhBadge>
                      </RhTd>
                      <RhTd>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className={`${rhBtnQuick} !border-emerald-500/30 !text-emerald-200`}
                            disabled={busy}
                            onClick={() => void onDailyPunch(member.userId, "entrada")}
                          >
                            Entrada
                          </button>
                          <button
                            type="button"
                            className={`${rhBtnQuick} !border-sky-500/30 !text-sky-200`}
                            disabled={busy}
                            onClick={() => void onDailyPunch(member.userId, "saida")}
                          >
                            Saída
                          </button>
                          <button
                            type="button"
                            className={rhBtnQuick}
                            disabled={busy}
                            onClick={() => void onDailyAbsence(member.userId, "falta_justificada")}
                          >
                            F. just.
                          </button>
                          <button
                            type="button"
                            className={`${rhBtnQuick} !border-red-500/30 !text-red-200`}
                            disabled={busy}
                            onClick={() => void onDailyAbsence(member.userId, "falta_injustificada")}
                          >
                            F. injust.
                          </button>
                        </div>
                      </RhTd>
                    </tr>
                  );
                })}
              </tbody>
            </>
          ) : null}
        </RhTable>
      </RhCard>

      <RhCard
        title="Resumo mensal"
        description={`Totais calculados para ${periodKey}.`}
      >
        <RhTable isEmpty={attendanceRows.length === 0} empty="Sem registos neste período.">
          {attendanceRows.length > 0 ? (
            <>
              <thead>
                <tr>
                  <RhTh>Colaborador</RhTh>
                  <RhTh>Presentes</RhTh>
                  <RhTh>Faltas just.</RhTh>
                  <RhTh>Faltas injust.</RhTh>
                </tr>
              </thead>
              <tbody>
                {attendanceRows.map((row) => (
                  <tr key={row.id}>
                    <RhTd>{row.colaborador}</RhTd>
                    <RhTd className="text-emerald-300">{row.diasTrabalhados}</RhTd>
                    <RhTd>{row.faltasJustificadas}</RhTd>
                    <RhTd className="font-medium text-amber-300">{row.faltasInjustificadas}</RhTd>
                  </tr>
                ))}
              </tbody>
            </>
          ) : null}
        </RhTable>
      </RhCard>
    </div>
  );
}

function RhSalaryPanel({
  payroll,
  salaryBalances,
  salaryPayments,
  colaboradoresEmAtraso,
  totalSaldoPendente,
  collaborators,
  saving,
  onOpenProfile,
  onOpenPaymentModal,
  onPayRemaining,
  onDeletePayment,
  onExportSalaryPdf,
  onExportFeriasPdf,
}: RhPanelsProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <RhKpi label="Em atraso / parcial" value={String(colaboradoresEmAtraso)} tone="warning" />
        <RhKpi label="Total pendente" value={moneyAoa(totalSaldoPendente)} tone="danger" />
        <RhKpi label="Pagamentos" value={String(salaryPayments.length)} tone="neutral" />
      </div>

      <RhCard
        title="Folha salarial"
        description="Líquido após descontos de faltas e INSS."
        actions={
          <>
            <button type="button" className={rhBtnGhost} onClick={onExportSalaryPdf}>
              PDF folha
            </button>
            <button type="button" className={rhBtnGhost} onClick={onExportFeriasPdf}>
              PDF férias
            </button>
            <button
              type="button"
              className={rhBtnPrimarySm}
              disabled={collaborators.length === 0}
              onClick={() => onOpenPaymentModal()}
            >
              + Pagamento
            </button>
          </>
        }
      >
        {collaborators.length > 0 &&
        salaryBalances.every((line) => line.salarioBaseAoa <= 0) ? (
          <p className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/90">
            Nenhum salário definido. Abre{" "}
            <button
              type="button"
              className="font-medium text-amber-300 underline hover:text-amber-200"
              onClick={() => onOpenProfile(collaborators[0]?.userId)}
            >
              Editar ficha
            </button>{" "}
            em cada colaborador e preenche o salário base.
          </p>
        ) : null}

        <RhTable
          isEmpty={collaborators.length === 0}
          empty={<RhNoCollaboratorsMessage />}
        >
          {salaryBalances.length > 0 ? (
            <>
              <thead>
                <tr>
                  <RhTh>Colaborador</RhTh>
                  <RhTh>Base</RhTh>
                  <RhTh>Desconto</RhTh>
                  <RhTh>Líquido</RhTh>
                  <RhTh>Situação</RhTh>
                  <RhTh>Pendente</RhTh>
                  <RhTh />
                </tr>
              </thead>
              <tbody>
                {salaryBalances.map((line) => (
                  <tr key={line.userId} className="hover:bg-white/[0.02]">
                    <RhTd className="font-medium text-white">{line.colaborador}</RhTd>
                    <RhTd>{line.salarioBaseAoa > 0 ? moneyAoa(line.salarioBaseAoa) : "—"}</RhTd>
                    <RhTd className="text-red-300">
                      {line.descontoFaltasAoa > 0 ? moneyAoa(line.descontoFaltasAoa) : "—"}
                    </RhTd>
                    <RhTd className="text-emerald-300">
                      {line.liquidoDevidoAoa > 0 ? moneyAoa(line.liquidoDevidoAoa) : "—"}
                    </RhTd>
                    <RhTd>
                      <RhBadge className={salarySituationBadge(line.situacao)}>
                        {salarySituationLabel(line.situacao)}
                      </RhBadge>
                    </RhTd>
                    <RhTd className="font-medium text-amber-300">
                      {line.saldoPendenteAoa > 0 ? moneyAoa(line.saldoPendenteAoa) : "—"}
                    </RhTd>
                    <RhTd>
                      <div className="flex flex-wrap gap-1">
                        {line.saldoPendenteAoa > 0 ? (
                          <button
                            type="button"
                            className={`${rhBtnQuick} !text-emerald-200`}
                            disabled={saving}
                            onClick={() => void onPayRemaining(line)}
                          >
                            Pagar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={rhBtnQuick}
                          disabled={saving}
                          onClick={() => onOpenPaymentModal(line.userId, "adiantamento")}
                        >
                          Adiant.
                        </button>
                      </div>
                    </RhTd>
                  </tr>
                ))}
              </tbody>
            </>
          ) : null}
        </RhTable>
      </RhCard>

      <RhCard title="Histórico de pagamentos" description="Salários e adiantamentos do período.">
        <RhTable isEmpty={salaryPayments.length === 0} empty="Nenhum pagamento registado.">
          {salaryPayments.length > 0 ? (
            <>
              <thead>
                <tr>
                  <RhTh>Data</RhTh>
                  <RhTh>Colaborador</RhTh>
                  <RhTh>Tipo</RhTh>
                  <RhTh>Valor</RhTh>
                  <RhTh>Referência</RhTh>
                  <RhTh />
                </tr>
              </thead>
              <tbody>
                {salaryPayments.map((payment) => (
                  <tr key={payment.id}>
                    <RhTd className="text-zinc-400">{payment.dataPagamento}</RhTd>
                    <RhTd>{payment.colaborador}</RhTd>
                    <RhTd>{payment.tipo === "adiantamento" ? "Adiantamento" : "Salário"}</RhTd>
                    <RhTd className="font-medium text-emerald-300">{moneyAoa(payment.valorAoa)}</RhTd>
                    <RhTd className="text-zinc-500">
                      {payment.referencia || "—"}
                      {payment.ledgerEntryId ? (
                        <span className="mt-0.5 block text-[10px] text-sky-400/90">
                          Saída no fluxo de caixa
                        </span>
                      ) : null}
                    </RhTd>
                    <RhTd>
                      <button
                        type="button"
                        className="text-xs text-red-300 hover:underline disabled:opacity-50"
                        disabled={saving}
                        onClick={() => void onDeletePayment(payment)}
                      >
                        Remover
                      </button>
                    </RhTd>
                  </tr>
                ))}
              </tbody>
            </>
          ) : null}
        </RhTable>
      </RhCard>
    </div>
  );
}
