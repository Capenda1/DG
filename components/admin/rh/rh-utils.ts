import type {
  RhContractStatus,
  RhDayStatus,
  RhDocumentStatus,
  RhSalarySituation,
  UserRole,
} from "@/lib/api-client";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  ATTENDANT: "Atendente",
  DESIGNER: "Designer",
  CLIENT: "Cliente",
  COLLABORATOR: "Colaborador (sem acesso)",
};

export type RhTabId = "equipa" | "documentos" | "ponto" | "salarios";

export const RH_TABS: { id: RhTabId; label: string; hint: string }[] = [
  { id: "equipa", label: "Equipa", hint: "Fichas e organograma" },
  { id: "documentos", label: "Documentos", hint: "Anexos legais" },
  { id: "ponto", label: "Ponto", hint: "Entradas e faltas" },
  { id: "salarios", label: "Salários", hint: "Folha e pagamentos" },
];

export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayPtDate(): string {
  return new Intl.DateTimeFormat("pt-PT").format(new Date());
}

export function moneyAoa(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 2,
  }).format(value);
}

export function dayStatusLabel(status: RhDayStatus | null | undefined): string {
  switch (status) {
    case "presente":
      return "Presente";
    case "falta_justificada":
      return "Falta justificada";
    case "falta_injustificada":
      return "Falta injustificada";
    default:
      return "Sem registo";
  }
}

export function salarySituationLabel(situacao: RhSalarySituation): string {
  switch (situacao) {
    case "pago":
      return "Pago";
    case "em_atraso":
      return "Em atraso";
    case "parcial":
      return "Parcial";
    case "com_adiantamento":
      return "Com adiantamento";
    default:
      return "Sem salário";
  }
}

export function badgeClass(
  kind:
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "neutral"
    | "violet",
): string {
  switch (kind) {
    case "success":
      return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25";
    case "warning":
      return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25";
    case "danger":
      return "bg-red-500/15 text-red-300 ring-1 ring-red-500/25";
    case "info":
      return "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/25";
    case "violet":
      return "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/25";
    default:
      return "bg-zinc-700/30 text-zinc-400 ring-1 ring-zinc-600/40";
  }
}

export function dayStatusBadge(status: RhDayStatus | null | undefined): string {
  switch (status) {
    case "presente":
      return badgeClass("success");
    case "falta_justificada":
      return badgeClass("warning");
    case "falta_injustificada":
      return badgeClass("danger");
    default:
      return badgeClass("neutral");
  }
}

export function salarySituationBadge(situacao: RhSalarySituation): string {
  switch (situacao) {
    case "pago":
      return badgeClass("success");
    case "em_atraso":
      return badgeClass("danger");
    case "parcial":
      return badgeClass("warning");
    case "com_adiantamento":
      return badgeClass("violet");
    default:
      return badgeClass("neutral");
  }
}

export function contractStatusBadge(status: RhContractStatus): string {
  switch (status) {
    case "Ativo":
      return badgeClass("success");
    case "Em férias":
      return badgeClass("warning");
    case "Licença":
      return badgeClass("violet");
    default:
      return badgeClass("neutral");
  }
}

export function documentStatusBadge(status: RhDocumentStatus): string {
  switch (status) {
    case "Carregado":
      return badgeClass("success");
    case "Pendente":
      return badgeClass("warning");
    case "Expirado":
      return badgeClass("danger");
    default:
      return badgeClass("neutral");
  }
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
