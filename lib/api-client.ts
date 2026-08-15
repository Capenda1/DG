import { getApiBaseUrl } from "./api-config";
import type { AuthSession } from "./auth-session";
import type { PdvCashZReportSnapshot } from "./cash-register-z-print";
import type { OrderModelagemSpecsPayload } from "./modelagem-specs";
import { normalizeEmail } from "./email";
import {
  clearSession,
  emitSessionInvalidated,
  loadSession,
  updateSessionUser,
} from "./auth-session";

function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}

const DEFAULT_API_FETCH_TIMEOUT_MS = 30_000;

function composeSignals(
  userSignal: AbortSignal | undefined,
  deadlineSignal: AbortSignal,
): AbortSignal {
  if (!userSignal) return deadlineSignal;
  if (
    typeof AbortSignal !== "undefined" &&
    "any" in AbortSignal &&
    typeof AbortSignal.any === "function"
  ) {
    return AbortSignal.any([userSignal, deadlineSignal]);
  }
  return deadlineSignal;
}

async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  deadlineMs = DEFAULT_API_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const tid = globalThis.setTimeout(() => ctrl.abort(), deadlineMs);
  try {
    const signal = composeSignals(
      init.signal === null ? undefined : init.signal,
      ctrl.signal,
    );
    return await fetch(url, { ...init, signal });
  } catch (e: unknown) {
    if (
      ctrl.signal.aborted ||
      (typeof DOMException !== "undefined" &&
        e instanceof DOMException &&
        e.name === "AbortError")
    ) {
      throw new Error(
        `A ligação ao servidor ultrapassou ${Math.round(deadlineMs / 1000)} s ou foi interrompida. Confirme que a API Nest está activa.`,
      );
    }
    throw e;
  } finally {
    globalThis.clearTimeout(tid);
  }
}


async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(data.message)) {
      return data.message.join(", ");
    }
    if (typeof data.message === "string") {
      return data.message;
    }
  } catch {
    /* ignore */
  }
  return res.statusText || "Pedido falhou";
}

/** Pedido autenticado: envia Bearer e, em 401, tenta refresh uma vez (partilhado entre chamadas paralelas). */
export type ApiFetchInit = RequestInit & {
  auth?: boolean;
  /** Tempo máximo por pedido (ms); evita ecrãs presos se a API não responder. */
  timeoutMs?: number;
};

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<boolean> => {
      try {
        // Refresh usa cookies HttpOnly — não exige perfil em sessionStorage.
        let res: Response;
        try {
          res = await fetchWithDeadline(apiUrl("/api/session/refresh"), {
            method: "POST",
            credentials: "include",
          });
        } catch {
          /* rede/timeout: não limpar sessão nem emitir evento global */
          return false;
        }
        if (!res.ok) {
          clearSession();
          emitSessionInvalidated();
          return false;
        }
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Cliente HTTP base. Com `auth: true`, anexa o access token atual e repete o pedido
 * após refresh se receber 401.
 */
export async function apiFetch(
  path: string,
  init: ApiFetchInit = {},
): Promise<Response> {
  const {
    auth = false,
    timeoutMs = DEFAULT_API_FETCH_TIMEOUT_MS,
    headers: inputHeaders,
    signal: userSignalMaybe,
    ...rest
  } = init;
  const userSignal =
    userSignalMaybe === undefined || userSignalMaybe === null
      ? undefined
      : userSignalMaybe;
  const headers = new Headers(inputHeaders);
  // Pedidos com body JSON sem Content-Type → Express não faz parse → @Body() undefined → 500
  if (
    typeof rest.body === "string" &&
    rest.body.length > 0 &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const fetchInit: RequestInit = {
    ...rest,
    headers,
    signal: userSignal,
    credentials: auth ? "include" : rest.credentials,
  };

  let res = await fetchWithDeadline(apiUrl(path), fetchInit, timeoutMs);

  if (auth && res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retryHeaders = new Headers(inputHeaders);
      if (
        typeof rest.body === "string" &&
        rest.body.length > 0 &&
        !retryHeaders.has("Content-Type")
      ) {
        retryHeaders.set("Content-Type", "application/json");
      }
      res = await fetchWithDeadline(
        apiUrl(path),
        {
          ...rest,
          headers: retryHeaders,
          signal: userSignal,
          credentials: "include",
        },
        timeoutMs,
      );
    }
  }

  return res;
}

/** Erro de pedido HTTP com código de estado (útil para 401 → login). */
export type ApiRequestError = Error & { status: number };

export async function apiJson<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const message = await readErrorMessage(res);
    const err = new Error(message) as ApiRequestError;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function apiVoid(path: string, init: ApiFetchInit = {}): Promise<void> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
}

export type LoginResult =
  | AuthSession
  | { mfaRequired: true; mfaToken: string };

export type LoginIdentifier =
  | { email: string; phone?: never }
  | { phone: string; email?: never };

export async function loginRequest(
  identifier: LoginIdentifier,
  password: string,
): Promise<LoginResult> {
  const res = await fetchWithDeadline(apiUrl("/api/session/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...identifier, password }),
  });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    const err = new Error(message) as ApiRequestError;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<LoginResult>;
}

export async function registerClientRequest(body: {
  name: string;
  phone: string;
  isCompany: boolean;
  nif?: string;
  password: string;
}): Promise<AuthSession> {
  const res = await fetchWithDeadline(apiUrl("/api/session/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    const err = new Error(message) as ApiRequestError;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<AuthSession>;
}

export async function verifyMfaLoginRequest(
  mfaToken: string,
  code: string,
): Promise<AuthSession> {
  const res = await fetchWithDeadline(apiUrl("/api/session/mfa-verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ mfaToken, code }),
  });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    const err = new Error(message) as ApiRequestError;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<AuthSession>;
}

export async function beginMfaSetup(): Promise<{
  secret: string;
  otpauthUrl: string;
}> {
  return apiJson("/api/auth/mfa/setup", { method: "POST", auth: true });
}

export async function enableMfaSetup(
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  return apiJson("/api/auth/mfa/enable", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

export async function disableMfaSetup(
  password: string,
  code: string,
): Promise<{ message: string }> {
  return apiJson("/api/auth/mfa/disable", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, code }),
  });
}

/** Revoga cookies HttpOnly no servidor e limpa o perfil local. */
export async function logoutRequest(): Promise<void> {
  try {
    await fetchWithDeadline(apiUrl("/api/session/logout"), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* rede indisponível — limpa sessão local na mesma */
  } finally {
    clearSession();
    emitSessionInvalidated();
  }
}

export async function requestStaffPasswordReset(
  email: string,
): Promise<{ message: string }> {
  return apiJson<{ message: string }>(
    "/api/auth/forgot-password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    },
  );
}

export async function verifyStaffPasswordResetCode(
  email: string,
  code: string,
): Promise<{ resetToken: string }> {
  return apiJson<{ resetToken: string }>("/api/auth/verify-reset-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
}

export async function confirmStaffPasswordReset(
  resetToken: string,
  newPassword: string,
): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resetToken, newPassword }),
  });
}

export async function fetchMe(): Promise<AuthSession["user"]> {
  const user = await apiJson<AuthSession["user"]>("/api/auth/me", {
    auth: true,
  });
  updateSessionUser(user);
  return user;
}

export type UserRole =
  | "CLIENT"
  | "DESIGNER"
  | "ATTENDANT"
  | "ADMIN"
  | "COLLABORATOR";

export type AdminUserListItem = AuthSession["user"] & {
  orderCount?: number;
};

export type ListUsersParams = {
  q?: string;
  role?: UserRole;
  /** Ex.: excluir CLIENT da lista da equipa. */
  excludeRole?: UserRole;
  includeOrderCount?: boolean;
};

export async function listUsersAsAdmin(
  params?: ListUsersParams,
): Promise<AdminUserListItem[]> {
  const searchParams = new URLSearchParams();
  if (params?.q?.trim()) {
    searchParams.set("q", params.q.trim());
  }
  if (params?.role) {
    searchParams.set("role", params.role);
  }
  if (params?.excludeRole) {
    searchParams.set("excludeRole", params.excludeRole);
  }
  if (params?.includeOrderCount) {
    searchParams.set("includeOrderCount", "true");
  }
  const qs = searchParams.toString();
  const path = qs ? `/api/admin/users?${qs}` : "/api/admin/users";
  return apiJson<AdminUserListItem[]>(path, { auth: true });
}

export async function checkAdminUserEmailAvailability(
  email: string,
  excludeId?: string,
): Promise<{
  available: boolean;
  email?: string;
  message?: string;
  existingRole?: UserRole;
}> {
  const searchParams = new URLSearchParams({ email: normalizeEmail(email) });
  if (excludeId) {
    searchParams.set("excludeId", excludeId);
  }
  return apiJson(`/api/admin/users/check-email?${searchParams.toString()}`, {
    auth: true,
  });
}

export async function createUserAsAdmin(body: {
  email?: string;
  name: string;
  password?: string;
  role: UserRole;
  phone?: string;
  isCompany?: boolean;
  nif?: string;
}): Promise<{ user: AuthSession["user"] }> {
  const s = loadSession();
  if (!s) {
    throw new Error("Não autenticado.");
  }
  return apiJson<{ user: AuthSession["user"] }>("/api/admin/users", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type AdminUpdateUserBody = {
  email?: string;
  name?: string;
  role?: UserRole;
  phone?: string;
  isCompany?: boolean;
  nif?: string;
  active?: boolean;
};

export async function updateUserAsAdmin(
  id: string,
  body: AdminUpdateUserBody,
): Promise<{ user: AuthSession["user"] }> {
  return apiJson<{ user: AuthSession["user"] }>(`/api/admin/users/${id}`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function resetUserPasswordAsAdmin(
  id: string,
  newPassword: string,
): Promise<void> {
  await apiVoid(`/api/admin/users/${id}/reset-password`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
}

export async function deleteUserAsAdmin(id: string): Promise<void> {
  await apiVoid(`/api/admin/users/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

/* ─── RH (Recursos Humanos) ─────────────────────────────────── */

export type RhContractStatus = "Ativo" | "Em férias" | "Licença";
export type RhDayStatus = "presente" | "falta_justificada" | "falta_injustificada";
export type RhDocumentStatus = "Carregado" | "Pendente" | "Expirado";
export type RhDocumentType =
  | "BI"
  | "Contrato"
  | "NIF"
  | "Certificado"
  | "Extrato"
  | "Outro";

export interface RhCollaboratorView {
  userId: string;
  nome: string;
  email: string;
  telefone: string | null;
  role: UserRole;
  nif: string;
  iban: string;
  cargo: string;
  departamento: string;
  gestorDireto: string;
  dataAdmissao: string;
  salarioBaseAoa: number;
  estadoContrato: RhContractStatus;
  hasRhProfile: boolean;
}

export interface RhDocumentView {
  id: string;
  userId: string;
  colaborador: string;
  tipo: RhDocumentType;
  referencia: string;
  validade: string;
  estado: RhDocumentStatus;
  fileName: string | null;
  fileMime: string | null;
  fileSizeBytes: number | null;
  hasFile: boolean;
}

export interface RhAttendanceView {
  id: string;
  userId: string;
  colaborador: string;
  periodKey: string;
  diasTrabalhados: number;
  faltasJustificadas: number;
  faltasInjustificadas: number;
  atrasos: number;
  horasExtra: number;
  saldoFeriasDias: number;
}

export interface RhDailyAttendanceView {
  id: string;
  userId: string;
  colaborador: string;
  date: string;
  status: RhDayStatus;
  entrada: string | null;
  saida: string | null;
}

export interface RhPayrollLine {
  userId: string;
  colaborador: string;
  salarioBaseAoa: number;
  diasUteisMes: number;
  diasPresentes: number;
  faltasJustificadas: number;
  faltasInjustificadas: number;
  valorDiaAoa: number;
  descontoFaltasAoa: number;
  salarioAjustadoAoa: number;
  inssTrabalhadorAoa: number;
  inssEntidadeAoa: number;
  liquidoAntesIrtAoa: number;
}

export type RhSalaryPaymentType = "salario" | "adiantamento";

export type RhSalarySituation =
  | "sem_salario"
  | "pago"
  | "em_atraso"
  | "parcial"
  | "com_adiantamento";

export interface RhSalaryPaymentView {
  id: string;
  userId: string;
  colaborador: string;
  periodKey: string;
  tipo: RhSalaryPaymentType;
  valorAoa: number;
  dataPagamento: string;
  referencia: string;
  notas: string;
  createdAt: string;
  ledgerEntryId?: string;
}

export interface RhSalaryBalanceLine extends RhPayrollLine {
  liquidoDevidoAoa: number;
  totalPagoSalarioAoa: number;
  totalAdiantamentoAoa: number;
  totalPagoAoa: number;
  saldoPendenteAoa: number;
  saldoCreditoAoa: number;
  situacao: RhSalarySituation;
}

export interface RhOrgNode {
  gestor: string;
  equipa: string[];
}

export interface RhOverview {
  periodKey: string;
  collaborators: RhCollaboratorView[];
  documents: RhDocumentView[];
  attendance: RhAttendanceView[];
  dailyAttendance: RhDailyAttendanceView[];
  payroll: RhPayrollLine[];
  salaryPayments: RhSalaryPaymentView[];
  salaryBalances: RhSalaryBalanceLine[];
  orgChart: RhOrgNode[];
}

export type UpsertRhProfileBody = {
  nif?: string;
  iban?: string;
  cargo?: string;
  departamento?: string;
  gestorDireto?: string;
  dataAdmissao?: string;
  salarioBaseAoa?: number;
  estadoContrato?: RhContractStatus;
};

export async function getRhOverview(period?: string): Promise<RhOverview> {
  const qs = period ? `?period=${encodeURIComponent(period)}` : "";
  return apiJson<RhOverview>(`/api/rh/overview${qs}`, { auth: true });
}

export async function upsertRhProfile(
  userId: string,
  body: UpsertRhProfileBody,
): Promise<void> {
  await apiJson(`/api/rh/profiles/${userId}`, {
    method: "PUT",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createRhDocument(
  body: {
    userId: string;
    tipo: RhDocumentType;
    referencia: string;
    validade?: string;
    estado: RhDocumentStatus;
  },
  file: File,
): Promise<RhDocumentView> {
  const form = new FormData();
  form.append("userId", body.userId);
  form.append("tipo", body.tipo);
  form.append("referencia", body.referencia);
  if (body.validade) form.append("validade", body.validade);
  form.append("estado", body.estado);
  form.append("file", file);

  const res = await apiFetch("/api/rh/documents", {
    method: "POST",
    auth: true,
    body: form,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<RhDocumentView>;
}

export async function fetchRhDocumentFileBlob(documentId: string): Promise<Blob> {
  const res = await apiFetch(`/api/rh/documents/${documentId}/file`, {
    auth: true,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.blob();
}

export async function deleteRhDocument(documentId: string): Promise<void> {
  await apiVoid(`/api/rh/documents/${documentId}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function createRhAttendance(body: {
  userId: string;
  periodKey?: string;
  diasTrabalhados?: number;
  faltasJustificadas?: number;
  faltasInjustificadas?: number;
  atrasos?: number;
  horasExtra?: number;
  saldoFeriasDias?: number;
}): Promise<RhAttendanceView> {
  return apiJson<RhAttendanceView>("/api/rh/attendance", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function upsertRhDailyAttendance(body: {
  userId: string;
  date: string;
  status: RhDayStatus;
  entrada?: string;
  saida?: string;
}): Promise<RhDailyAttendanceView> {
  return apiJson<RhDailyAttendanceView>("/api/rh/daily", {
    method: "PUT",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function registerRhDailyPunch(body: {
  userId: string;
  date?: string;
  punch: "entrada" | "saida";
  hora?: string;
}): Promise<RhDailyAttendanceView> {
  return apiJson<RhDailyAttendanceView>("/api/rh/daily/punch", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createRhSalaryPayment(body: {
  userId: string;
  periodKey: string;
  tipo: RhSalaryPaymentType;
  valorAoa: number;
  dataPagamento?: string;
  referencia?: string;
  notas?: string;
}): Promise<RhSalaryPaymentView> {
  return apiJson<RhSalaryPaymentView>("/api/rh/payments", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteRhSalaryPayment(paymentId: string): Promise<void> {
  await apiVoid(`/api/rh/payments/${paymentId}`, {
    method: "DELETE",
    auth: true,
  });
}

export type SmsNotificationHistoryItem = {
  id: string;
  status: "PENDING" | "SENT" | "FAILED" | "READ";
  title: string;
  body: string;
  createdAt: string;
  sentAt: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  recipientId: string;
  recipientName: string;
  recipientPhone: string | null;
  sentByName: string | null;
  to: string | null;
  twilioSid: string | null;
  error: string | null;
  skipped: boolean;
  skipReason: string | null;
};

export type SmsNotificationHistoryResponse = {
  items: SmsNotificationHistoryItem[];
  total: number;
  summary: { sent: number; failed: number; pending: number; read: number };
};

export type SmsTwilioStatus = {
  enabled: boolean;
  configured: boolean;
  smsFrom: string | null;
  missing: string[];
  senderKind: "alphanumeric" | "phone" | null;
  isUsNumber: boolean;
  recommendedForAngola: boolean;
  oneWayChannel: boolean;
  warnings: string[];
  recommendedSender: string;
  setupGuidePath: string;
  configSource: "database" | "env" | null;
};

export type TwilioSmsSettings = {
  enabled: boolean;
  accountSid: string;
  smsFrom: string;
  messageTemplate: string;
  oneWayFooter: string;
  hasAuthToken: boolean;
  configSource: "database" | "env";
};

export type TwilioSmsSettingsUpdate = Partial<
  Omit<TwilioSmsSettings, "hasAuthToken" | "configSource">
> & {
  authToken?: string;
};

export async function fetchSmsTwilioStatus(): Promise<SmsTwilioStatus> {
  return apiJson<SmsTwilioStatus>("/api/notifications/sms/status", { auth: true });
}

export async function fetchTwilioSmsSettings(): Promise<TwilioSmsSettings> {
  return apiJson<TwilioSmsSettings>("/api/notifications/sms/settings", {
    auth: true,
  });
}

export async function adminUpdateTwilioSmsSettings(
  data: TwilioSmsSettingsUpdate,
): Promise<TwilioSmsSettings> {
  return apiJson<TwilioSmsSettings>("/api/notifications/sms/settings", {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(data),
  });
}

export async function deleteSmsNotification(id: string): Promise<{ deleted: number }> {
  return apiJson<{ deleted: number }>(`/api/notifications/sms/history/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function deleteSmsNotificationsBulk(
  ids: string[],
): Promise<{ deleted: number }> {
  return apiJson<{ deleted: number }>("/api/notifications/sms/history", {
    method: "DELETE",
    auth: true,
    body: JSON.stringify({ ids }),
  });
}

export async function fetchSmsNotificationHistory(params?: {
  take?: number;
  skip?: number;
  status?: string;
  q?: string;
  orderId?: string;
}): Promise<SmsNotificationHistoryResponse> {
  const searchParams = new URLSearchParams();
  if (params?.take != null) searchParams.set("take", String(params.take));
  if (params?.skip != null) searchParams.set("skip", String(params.skip));
  if (params?.status) searchParams.set("status", params.status);
  if (params?.q) searchParams.set("q", params.q);
  if (params?.orderId) searchParams.set("orderId", params.orderId);
  const qs = searchParams.toString();
  return apiJson<SmsNotificationHistoryResponse>(
    `/api/notifications/sms/history${qs ? `?${qs}` : ""}`,
    { auth: true },
  );
}

export type InvoiceDocumentModelValue =
  | "FACTURA_POR_FORMA"
  | "FACTURA_RECIBO"
  | "FACTURA";

export type OrderDocumentIssueAction = "PRINT" | "DOWNLOAD" | "SHARE";

export type OrderDocumentIssueResult = {
  id: string;
  orderId: string;
  orderNumber: string;
  documentModel: InvoiceDocumentModelValue;
  documentNumber: string;
  sequenceYear: number;
  sequenceNum: number;
  action: OrderDocumentIssueAction;
  isReprint: boolean;
  issuedAt: string;
  issuedBy: { id: string; name: string } | null;
};

export async function issueOrderDocument(
  orderId: string,
  body: {
    documentModel: InvoiceDocumentModelValue;
    action: OrderDocumentIssueAction;
  },
): Promise<OrderDocumentIssueResult> {
  return apiJson<OrderDocumentIssueResult>(
    `/api/orders/${orderId}/documents/issue`,
    {
      method: "POST",
      auth: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

/** Pedido (lista ou detalhe) — resposta JSON da API. */
export type PaymentMethodValue =
  | "BANK_TRANSFER_SAME"
  | "DEPOSIT"
  | "BANK_TRANSFER_EXPRESS"
  | "CASH_ON_SITE"
  | "PDV_CASH"
  | "PDV_DEBIT_CARD"
  | "PDV_CREDIT_CARD";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  BANK_TRANSFER_SAME:    "Transferência mesmo banco",
  DEPOSIT:               "Depósito",
  BANK_TRANSFER_EXPRESS: "Transferência express",
  CASH_ON_SITE:          "Pagamento com dinheiro físico no local",
  PDV_CASH:              "Dinheiro (balcão)",
  PDV_DEBIT_CARD:        "Cartão de débito (balcão)",
  PDV_CREDIT_CARD:       "Cartão de crédito (balcão)",
};

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: unknown;
  currency: string;
  /** Valor descontado no PDV (AOA). */
  discountAmount?: unknown;
  /** ONLINE (cliente na web) ou BALCAO (PDV). */
  orderOrigin?: "ONLINE" | "BALCAO";
  /** Rascunho de balcão partilhado com a equipa de design (visível na fila do designer). */
  draftSharedWithDesignTeam?: boolean;
  paymentMethod?: PaymentMethodValue | null;
  paymentProofKey?: string | null;
  paymentProofName?: string | null;
  paymentProofMime?: string | null;
  trackingCode?: string | null;
  notes?: string | null;
  /** Data/hora de recepção (PDV — manual). */
  receptionDate?: string | null;
  /** Especificações da modelagem (JSON v1: texto + linhas nome/tamanho/cor/lado). */
  modelagemSpecs?: unknown | null;
  createdAt: string;
  updatedAt: string;
  /** Preenchidos quando o pedido está «Entregue». */
  deliveredAt?: string | null;
  deliveredBy?: { id: string; email: string; name: string } | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledFromStatus?: string | null;
  cancelledBy?: { id: string; email: string; name: string } | null;
  /** Último documento PDF registado (Fase 2). */
  lastDocumentModel?: InvoiceDocumentModelValue | null;
  lastDocumentNumber?: string | null;
  lastDocumentIssuedAt?: string | null;
  client: {
    id: string;
    email: string;
    name: string;
    phone?: string | null;
    clientType?: "INDIVIDUAL" | "COMPANY" | null;
    nif?: string | null;
  };
  designer: { id: string; email: string; name: string } | null;
  attendant?: { id: string; email: string; name: string } | null;
  _count: { items: number; artVersions: number };
};

/** Resposta de `GET /orders?includeItems=1` (staff): linhas resumidas para relatórios. */
export type AdminOrderListRow = OrderListItem & {
  items?: Array<{
    productName: string;
    quantity: number;
    productionProcess?: string;
    metadata?: Record<string, unknown> | null;
  }>;
};

export type OrderItemRow = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: unknown;
  productionProcess: string;
  skuCode?: string | null;
  productVariantId?: string | null;
  /** Snapshot do catálogo (tipo de peça, cor, tamanho, SKU, etc.). */
  metadata?: Record<string, unknown> | null;
};

export type OrderDetail = OrderListItem & {
  items: OrderItemRow[];
  /** Incluído quando `orderDetailInclude()` expõe a última versão de arte (modelagem). */
  artVersions?: {
    versionIndex: number;
    layersJson?: unknown | null;
    storageKey?: string | null;
    createdAt: string;
    createdBy?: { id: string; name: string };
  }[];
};

export async function listOrders(take = 50): Promise<OrderListItem[]> {
  return apiJson<OrderListItem[]>(`/api/orders?take=${take}`, {
    auth: true,
  });
}

export async function getOrder(id: string): Promise<OrderDetail> {
  return apiJson<OrderDetail>(`/api/orders/${id}`, { auth: true });
}

export type CreateOrderBody = {
  notes?: string;
  items: Array<{
    /** Se definido, nome/preço/processos vêm do servidor (variante activa). */
    productVariantId?: string;
    /** Metros — Lona/Vinil. */
    widthM?: number;
    /** Metros — Lona/Vinil. */
    heightM?: number;
    productName?: string;
    quantity: number;
    unitPrice?: number;
    productionProcess?: "SUBLIMATION" | "DTF";
  }>;
};

export async function createOrder(body: CreateOrderBody): Promise<OrderDetail> {
  return apiJson<OrderDetail>("/api/orders", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type OrderModelagemFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export async function listOrderModelagemFiles(
  orderId: string,
): Promise<OrderModelagemFile[]> {
  return apiJson<OrderModelagemFile[]>(
    `/api/orders/${orderId}/modelagem/files`,
    { auth: true },
  );
}

export async function uploadOrderModelagemFile(
  orderId: string,
  file: File,
): Promise<OrderModelagemFile> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`/api/orders/${orderId}/modelagem/files`, {
    method: "POST",
    auth: true,
    body: form,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<OrderModelagemFile>;
}

export async function fetchOrderModelagemFileBlob(
  orderId: string,
  fileId: string,
): Promise<Blob> {
  const res = await apiFetch(
    `/api/orders/${orderId}/modelagem/files/${fileId}`,
    { auth: true },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.blob();
}

/** Última composição PNG guardada pelo editor de modelagem (`ArtVersion` mais recente). */
export async function fetchOrderLatestArtBlob(orderId: string): Promise<Blob> {
  const res = await apiFetch(
    `/api/orders/${orderId}/modelagem/art/latest`,
    { auth: true },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.blob();
}

/** PDF ou imagem enviada pelo cliente como comprovativo de pagamento (submit). */
export async function fetchOrderPaymentProofBlob(
  orderId: string,
): Promise<Blob> {
  const res = await apiFetch(`/api/orders/${orderId}/payment-proof`, {
    auth: true,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.blob();
}

export async function submitOrder(
  orderId: string,
  paymentMethod: PaymentMethodValue,
  proofFile?: File,
  options?: {
    /** Só PDV (staff): desconto em AOA aplicado ao submeter. */
    discountAmount?: number;
    /** Descrição do pedido (mapeada para `Order.notes`). */
    notes?: string;
    /** Data/hora de recepção (ISO 8601). */
    receptionDate?: string;
  },
): Promise<OrderDetail> {
  const form = new FormData();
  form.append("paymentMethod", paymentMethod);
  if (proofFile) form.append("proof", proofFile);
  if (
    options?.discountAmount !== undefined &&
    options.discountAmount !== null &&
    options.discountAmount > 0
  ) {
    form.append("discountAmount", String(options.discountAmount));
  }
  if (options?.notes !== undefined) {
    form.append("notes", options.notes);
  }
  if (options?.receptionDate !== undefined) {
    form.append("receptionDate", options.receptionDate);
  }

  const res = await apiFetch(`/api/orders/${orderId}/submit`, {
    method: "POST",
    auth: true,
    body: form,
    // Não definir Content-Type: o browser define automaticamente com boundary
  });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    const err = new Error(message) as ApiRequestError;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<OrderDetail>;
}

/* ─── Catálogo & produtos (admin) ───────────────────────────── */

export type CatalogVariant = {
  id: string;
  sku: string;
  size: string | null;
  baseColor: string | null;
  productionProcess: "SUBLIMATION" | "DTF" | null;
  garmentType: string | null;
  unitPrice: unknown;
  currency: string;
  metadata: unknown;
  active: boolean;
};

export type CatalogProduct = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  catalogFamily?: CatalogFamily;
  familyConfig?: ProductFamilyConfig | null;
  variants: CatalogVariant[];
};

export async function listCatalogProducts(): Promise<CatalogProduct[]> {
  return apiJson<CatalogProduct[]>("/api/catalog/products", { auth: true });
}

export type AdminProductVariant = CatalogVariant & {
  productId: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Preços em Kwanza — ver `product-color-prices.ts`.
 * Legado: `{ [cor]: { adult?, child? } }`.
 * Por marca: `{ [marcaAdulto]: { [cor]: { adult?, child? } } }`.
 */
export type AdminProductColorPrices = Record<string, unknown>;

export type CatalogFamily =
  | "VESTUARIO"
  | "CANECA"
  | "IMPRESSAO_PLANA"
  | "SERVICO"
  | "GENERICO";

export type ProductFamilyConfig = {
  garmentType?: "T_SHIRT" | "POLO" | "COLETE" | "BONE" | "PERSONALIZADO" | "EQUIPAMENTOS";
  previewKind?: "APPAREL" | "MUG" | "FLAT" | "AREA";
  pricingKind?: "FIXED" | "AREA";
  areaUnit?: "M";
};

export type ProductCatalogTemplate = {
  id: string;
  catalogFamily: CatalogFamily;
  code: string;
  name: string;
  hint: string;
  accent: string;
  garmentType?: "T_SHIRT" | "POLO" | "COLETE" | "BONE" | "PERSONALIZADO" | "EQUIPAMENTOS";
  sortOrder: number;
  active: boolean;
};

export type AdminProduct = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  catalogFamily?: CatalogFamily;
  familyConfig?: ProductFamilyConfig | null;
  colorPrices?: AdminProductColorPrices | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  variants: AdminProductVariant[];
};

export type AdminProductsCatalogStats = {
  variantCountAll: number;
  activeProducts: number;
  activeVariantsInCatalog: number;
};

export type AdminProductsPage = {
  items: AdminProduct[];
  total: number;
  catalogStats: AdminProductsCatalogStats;
};

export async function listAdminProducts(params?: {
  q?: string;
  take?: number;
  skip?: number;
  status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  catalogLine?: "APPAREL" | "GENERIC";
  catalogFamily?: CatalogFamily;
}): Promise<AdminProductsPage> {
  const q = new URLSearchParams();
  if (params?.q?.trim()) q.set("q", params.q.trim());
  if (params?.take !== undefined) q.set("take", String(params.take));
  if (params?.skip !== undefined) q.set("skip", String(params.skip));
  if (params?.status) q.set("status", params.status);
  if (params?.catalogLine) q.set("catalogLine", params.catalogLine);
  if (params?.catalogFamily) q.set("catalogFamily", params.catalogFamily);
  const qs = q.toString();
  return apiJson<AdminProductsPage>(
    `/api/admin/products${qs ? `?${qs}` : ""}`,
    { auth: true },
  );
}

/** Um produto com todas as variantes (pesquisar fora da página ou após PATCH). */
export async function getAdminProduct(productId: string): Promise<AdminProduct> {
  return apiJson<AdminProduct>(`/api/admin/products/${productId}`, {
    auth: true,
  });
}

export async function createAdminProduct(body: {
  code: string;
  name: string;
  description?: string;
  catalogFamily?: CatalogFamily;
  familyConfig?: ProductFamilyConfig;
  status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}): Promise<{ id: string }> {
  return apiJson("/api/admin/products", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listAdminCatalogTemplates(): Promise<
  ProductCatalogTemplate[]
> {
  return apiJson<ProductCatalogTemplate[]>(
    "/api/admin/products/catalog/templates",
    { auth: true },
  );
}

export async function saveAdminCatalogTemplates(
  templates: ProductCatalogTemplate[],
): Promise<ProductCatalogTemplate[]> {
  return apiJson<ProductCatalogTemplate[]>("/api/admin/products/catalog/templates", {
    method: "PUT",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templates }),
  });
}

export async function updateAdminProduct(
  productId: string,
  body: {
    name?: string;
    description?: string | null;
    status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
    colorPrices?: AdminProductColorPrices | null;
  },
): Promise<AdminProduct> {
  return apiJson(`/api/admin/products/${productId}`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Corpo para criar variante (admin); `null` limpa cor/tipo em actualizações via PATCH. */
export type CreateAdminProductVariantBody = {
  sku: string;
  size?: string;
  baseColor?: string | null;
  productionProcess: "SUBLIMATION" | "DTF";
  garmentType?: string | null;
  unitPrice: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  active?: boolean;
};

export async function createAdminProductVariant(
  productId: string,
  body: CreateAdminProductVariantBody,
): Promise<AdminProductVariant> {
  return apiJson(`/api/admin/products/${productId}/variants`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Criação em batch (máx. 250 por pedido — o cliente faz chunks). */
export async function bulkCreateAdminProductVariants(
  productId: string,
  variants: CreateAdminProductVariantBody[],
): Promise<{ created: number; errors: string[] }> {
  return apiJson(`/api/admin/products/${productId}/variants/batch`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variants }),
  });
}

export async function updateAdminProductVariant(
  productId: string,
  variantId: string,
  body: {
    sku?: string;
    size?: string | null;
    baseColor?: string | null;
    productionProcess?: "SUBLIMATION" | "DTF" | null;
    garmentType?: string | null;
    unitPrice?: number;
    currency?: string;
    metadata?: Record<string, unknown> | null;
    active?: boolean;
  },
): Promise<AdminProductVariant> {
  return apiJson(
    `/api/admin/products/${productId}/variants/${variantId}`,
    {
      method: "PATCH",
      auth: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function deleteAdminProduct(productId: string): Promise<void> {
  await apiVoid(`/api/admin/products/${productId}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function deleteAdminProductVariant(
  productId: string,
  variantId: string,
): Promise<void> {
  await apiVoid(
    `/api/admin/products/${productId}/variants/${variantId}`,
    {
      method: "DELETE",
      auth: true,
    },
  );
}

/* ─── Settings ──────────────────────────────────────────────── */

/** Dados da empresa (configuráveis em Admin → Configurações). */
export interface BusinessProfileSettings {
  companyName: string;
  legalName: string;
  tagline: string;
  /** URL externa, caminho em `/public` ou `/api/settings/branding/…` após upload. */
  logoUrl: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  provinceRegion: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  businessHours: string;
  socialFacebook: string;
  socialInstagram: string;
  notes: string;
  /** Linha de certificação AGT — rodapé de facturas e documentos. */
  agtCertificationLine: string;
}

/** Identidade institucional para cabeçalhos de documentos (PDF, CSV, impressão). */
export interface DocumentBranding {
  displayName: string;
  legalName: string;
  tagline: string;
  logoUrl: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  identityLines: string[];
  agtCertificationLine: string;
}

export interface PaymentSettings {
  bankTransferSame: {
    enabled: boolean;
    accountNumber: string;
    accountName: string;
    bankName: string;
  };
  deposit: {
    enabled: boolean;
    accountNumber: string;
    bankName: string;
  };
  bankTransferExpress: {
    enabled: boolean;
    expressNumber: string;
    provider: string;
  };
  whatsappNumber: string;
  /** PDF do comprovante global (Configurações admin). */
  receiptPaperFormat:
    | "A4"
    | "A4_BW"
    | "A5_BW"
    | "THERMAL_80"
    | "THERMAL_58_BW";
}

/** Checkout na área conta — sem formato de papel do comprovante (só na API admin/atendente). */
export type ClientCheckoutPaymentSettings = Omit<
  PaymentSettings,
  "receiptPaperFormat"
>;

/** SMTP para envio de emails (recuperação de acesso, etc.) — só ADMIN. */
export interface SmtpMailSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string;
  from: string;
  appName: string;
  hasPassword: boolean;
}

export type SmtpMailSettingsUpdate = Partial<SmtpMailSettings> & {
  /** Só altera se enviada (vazia = manter actual). */
  pass?: string;
};

/** Aparência da página de login (fundo + overlay). */
export interface LoginAppearanceSettings {
  backgroundUrl: string;
  overlayOpacity: number;
  updatedAt: string;
}

export type LoginBrandingPublic = LoginAppearanceSettings;

export type LoginAppearanceUpdate = {
  overlayOpacity?: number;
};

/** Perfil da empresa (nome comercial, logo URL, contactos) — leitura para utilizadores autenticados. */
export async function getBusinessProfileSettings(): Promise<BusinessProfileSettings> {
  return apiJson<BusinessProfileSettings>("/api/settings/business", {
    auth: true,
  });
}

/** Nome comercial, NIF, morada e contacto — para PDFs e relatórios. */
export async function getDocumentBranding(): Promise<DocumentBranding> {
  return apiJson<DocumentBranding>("/api/settings/document-branding", {
    auth: true,
  });
}

/** Apenas ADMIN. */
export async function adminUpdateBusinessProfileSettings(
  data: Partial<BusinessProfileSettings>,
): Promise<BusinessProfileSettings> {
  return apiJson<BusinessProfileSettings>("/api/settings/business", {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Logo da empresa (`https://…`, `/ficheiro.png` no site ou `/api/settings/branding/…` na API)
 * — URL absoluta para `<img>` quando o ficheiro está na API.
 */
export function businessLogoDisplayUrl(
  logoUrl: string | null | undefined,
): string | undefined {
  if (logoUrl == null) return undefined;
  const k = logoUrl.trim();
  if (!k) return undefined;
  if (k.startsWith("data:")) return k;
  if (/^https?:\/\//i.test(k)) return k;
  const path = k.startsWith("/") ? k : `/${k}`;
  if (path.startsWith("/api/")) {
    const base = getApiBaseUrl().replace(/\/$/, "");
    return `${base}${path}`;
  }
  return path;
}

export async function uploadBusinessProfileLogo(
  file: File,
): Promise<BusinessProfileSettings> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/api/settings/business/logo", {
    method: "POST",
    auth: true,
    body: form,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<BusinessProfileSettings>;
}

/** Fundo do login — público, sem autenticação. */
export async function getPublicLoginBranding(): Promise<LoginBrandingPublic> {
  return apiJson<LoginBrandingPublic>("/api/settings/public/login-branding");
}

/** Aparência do login — só ADMIN. */
export async function getLoginAppearanceSettings(): Promise<LoginAppearanceSettings> {
  return apiJson<LoginAppearanceSettings>("/api/settings/login-appearance", {
    auth: true,
  });
}

export async function adminUpdateLoginAppearanceSettings(
  data: LoginAppearanceUpdate,
): Promise<LoginAppearanceSettings> {
  return apiJson<LoginAppearanceSettings>("/api/settings/login-appearance", {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
}

export async function uploadLoginBackground(
  file: File,
): Promise<LoginAppearanceSettings> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/api/settings/login-background", {
    method: "POST",
    auth: true,
    body: form,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<LoginAppearanceSettings>;
}

export async function resetLoginBackground(): Promise<LoginAppearanceSettings> {
  return apiJson<LoginAppearanceSettings>("/api/settings/login-background", {
    method: "DELETE",
    auth: true,
  });
}

/** Definições completas de pagamento — apenas ADMIN ou ATTENDANT. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  return apiJson<PaymentSettings>("/api/settings/payment", { auth: true });
}

export async function getClientCheckoutPaymentSettings(): Promise<ClientCheckoutPaymentSettings> {
  return apiJson<ClientCheckoutPaymentSettings>(
    "/api/settings/payment/client",
    { auth: true },
  );
}

/** Texto de rodapé do comprovante — apenas ADMIN ou ATTENDANT. */
export async function getReceiptFooterLines(): Promise<string[]> {
  const res = await apiJson<{ lines: string[] }>(
    "/api/settings/payment/receipt-footer",
    { auth: true },
  );
  return res.lines ?? [];
}

/* ─── Chat / Mensagens ──────────────────────────────────────── */

export type ChatMessage = {
  id: string;
  orderId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  sender: { id: string; name: string; role: string };
};

export async function listMessages(orderId: string, since?: string): Promise<ChatMessage[]> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  return apiJson<ChatMessage[]>(`/api/orders/${orderId}/messages${qs}`, { auth: true });
}

export async function sendMessage(orderId: string, content: string): Promise<ChatMessage> {
  return apiJson<ChatMessage>(`/api/orders/${orderId}/messages`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ content }),
    headers: { "Content-Type": "application/json" },
  });
}

export async function markMessagesRead(orderId: string): Promise<void> {
  await apiFetch(`/api/orders/${orderId}/messages/read`, { method: "PATCH", auth: true });
}

export async function getUnreadCount(orderId: string): Promise<number> {
  try {
    const map = await getUnreadCounts([orderId]);
    return map[orderId] ?? 0;
  } catch (e: unknown) {
    const status = (e as ApiRequestError)?.status;
    if (status === 429) return 0;
    throw e;
  }
}

/** Contagens de não lidas para vários pedidos num único pedido HTTP. */
export async function getUnreadCounts(
  orderIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return {};
  try {
    return await apiJson<Record<string, number>>('/api/messages/unread-counts', {
      method: 'POST',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds: ids }),
    });
  } catch (e: unknown) {
    const status = (e as ApiRequestError)?.status;
    if (status === 429) {
      return Object.fromEntries(ids.map((id) => [id, 0]));
    }
    throw e;
  }
}

export async function adminUpdatePaymentSettings(
  data: Partial<PaymentSettings>,
): Promise<PaymentSettings> {
  return apiJson<PaymentSettings>("/api/settings/payment", {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
}

/** SMTP — apenas ADMIN. A palavra-passe nunca é devolvida (`hasPassword` indica se existe). */
export async function getSmtpMailSettings(): Promise<SmtpMailSettings> {
  return apiJson<SmtpMailSettings>("/api/settings/smtp", { auth: true });
}

export async function adminUpdateSmtpMailSettings(
  data: SmtpMailSettingsUpdate,
): Promise<SmtpMailSettings> {
  return apiJson<SmtpMailSettings>("/api/settings/smtp", {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
}

/* ─── Backups manuais (ADMIN) ───────────────────────────────── */

export type AdminBackupKind = "database" | "uploads" | "full";

export type AdminBackupFileInfo = {
  name: string;
  kind: "database" | "uploads";
  sizeBytes: number;
};

export async function createAdminBackup(
  kind: AdminBackupKind,
): Promise<{ files: AdminBackupFileInfo[] }> {
  return apiJson<{ files: AdminBackupFileInfo[] }>("/api/admin/backups", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ kind }),
  });
}

export async function downloadAdminBackup(name: string): Promise<Blob> {
  const res = await apiFetch(
    `/api/admin/backups/${encodeURIComponent(name)}`,
    { auth: true },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.blob();
}

/** Dispara download no browser (para gravar em USB / disco externo). */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ─── Admin pedidos ─────────────────────────────────────────── */


export async function adminListOrders(
  take = 100,
  skip = 0,
  includeItems = false,
): Promise<AdminOrderListRow[]> {
  const q = new URLSearchParams();
  q.set("take", String(take));
  if (skip > 0) q.set("skip", String(skip));
  if (includeItems) q.set("includeItems", "1");
  return apiJson<AdminOrderListRow[]>(`/api/orders?${q}`, { auth: true });
}

export type CounterClientHit = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  clientType?: "INDIVIDUAL" | "COMPANY" | null;
  nif?: string | null;
  createdAt: string;
};

export async function searchCounterClients(
  q: string,
): Promise<CounterClientHit[]> {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  return apiJson<CounterClientHit[]>(
    `/api/orders/counter/clients?${qs.toString()}`,
    { auth: true },
  );
}

/** Registo rápido: cria utilizador CLIENT na base (aparece na busca do balcão). */
export async function registerCounterQuickClient(body: {
  name: string;
  phone?: string;
  isCompany?: boolean;
  nif?: string;
}): Promise<CounterClientHit> {
  return apiJson<CounterClientHit>("/api/orders/counter/clients", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Resumo de rascunho de balcão (pausar / retomar). */
export type CounterDraftSummary = {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  totalAmount: unknown;
  currency: string;
  draftSharedWithDesignTeam?: boolean;
  client: { id: string; name: string };
};

export async function listCounterDraftOrders(): Promise<CounterDraftSummary[]> {
  return apiJson<CounterDraftSummary[]>("/api/orders/counter/drafts", {
    auth: true,
  });
}

/** Rascunho de balcão com peças para modelagem: torna o pedido visível aos designers. */
export async function shareBalcaoDraftWithDesignTeam(
  orderId: string,
): Promise<OrderDetail> {
  return apiJson<OrderDetail>(
    `/api/orders/${orderId}/share-draft-with-design-team`,
    {
      method: "POST",
      auth: true,
    },
  );
}

export type CreateCounterOrderLine = {
  productVariantId?: string;
  /** Metros (Lona/Vinil). */
  widthM?: number;
  heightM?: number;
  /** Venda de insumo ao balcão (metadata STORE_RETAIL no servidor). */
  insumoId?: string;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  productionProcess?: "SUBLIMATION" | "DTF" | "STORE_RETAIL";
};

export type CounterInsumoListItem = {
  id: string;
  nome: string;
  unidade: string;
  stockActual: unknown;
  custoUnit?: unknown;
  /** Preço ao público / balcão; se vazio, usa-se custo. */
  precoVenda?: unknown | null;
  activo?: boolean;
};

export async function listCounterInsumos(): Promise<CounterInsumoListItem[]> {
  return apiJson<CounterInsumoListItem[]>("/api/orders/counter/insumos", {
    auth: true,
  });
}

export async function createCounterOrder(body: {
  clientId?: string;
  quickClient?: {
    name: string;
    phone?: string;
    isCompany?: boolean;
    nif?: string;
  };
  items: CreateCounterOrderLine[];
  notes?: string;
}): Promise<OrderDetail> {
  return apiJson<OrderDetail>("/api/orders/counter", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Substitui artigos de um rascunho de balcão (editar passo 1 sem novo pedido). */
export async function replaceCounterOrderItems(
  orderId: string,
  body: { items: CreateCounterOrderLine[]; notes?: string },
): Promise<OrderDetail> {
  return apiJson<OrderDetail>(`/api/orders/${orderId}/counter-items`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Cliente online: substitui artigos do próprio rascunho. */
export async function replaceClientDraftOrderItems(
  orderId: string,
  body: { items: CreateOrderBody["items"]; notes?: string },
): Promise<OrderDetail> {
  return apiJson<OrderDetail>(`/api/orders/${orderId}/draft-items`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
export async function claimOrderAsDesigner(
  orderId: string,
): Promise<OrderListItem> {
  return apiJson<OrderListItem>(
    `/api/orders/${orderId}/claim-designer`,
    { method: "POST", auth: true },
  );
}

export async function adminSetOrderPrice(
  orderId: string,
  totalAmount: number,
  notes?: string,
): Promise<OrderListItem> {
  return apiJson<OrderListItem>(`/api/orders/${orderId}/price`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify({ totalAmount, notes }),
    headers: { "Content-Type": "application/json" },
  });
}

export async function adminChangeOrderStatus(
  orderId: string,
  status: string,
  cancellationReason?: string,
): Promise<OrderListItem> {
  return apiJson<OrderListItem>(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify({ status, cancellationReason }),
    headers: { "Content-Type": "application/json" },
  });
}

export async function reopenCancelledOrder(
  orderId: string,
  reason?: string,
): Promise<OrderListItem> {
  return apiJson<OrderListItem>(`/api/orders/${orderId}/reopen`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ reason }),
    headers: { "Content-Type": "application/json" },
  });
}

/** Resposta de `GET /orders/:id/allowed-transitions` — próximos estados permitidos ao teu perfil. */
export async function getOrderAllowedTransitions(
  orderId: string,
): Promise<{ allowedNext: string[] }> {
  return apiJson<{ allowedNext: string[] }>(
    `/api/orders/${orderId}/allowed-transitions`,
    { auth: true },
  );
}

export async function deleteOrder(orderId: string): Promise<void> {
  const res = await apiFetch(`/api/orders/${orderId}`, {
    method: "DELETE",
    auth: true,
  });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    const err = new Error(message) as ApiRequestError;
    err.status = res.status;
    throw err;
  }
}

export async function deleteOrderModelagemFile(
  orderId: string,
  fileId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/orders/${orderId}/modelagem/files/${fileId}`,
    { method: "DELETE", auth: true },
  );
  if (!res.ok) {
    const message = await readErrorMessage(res);
    const err = new Error(message) as ApiRequestError;
    err.status = res.status;
    throw err;
  }
}

/** Resposta ao guardar a composição 2D como rascunho (ArtVersion). */
export type SaveModelagemCompositionResult = {
  id: string;
  versionIndex: number;
  status: string;
  createdAt: string;
  checksum: string;
};

export async function saveOrderModelagemComposition(
  orderId: string,
  pngBase64: string,
  layersJson?: unknown,
): Promise<SaveModelagemCompositionResult> {
  const payload: Record<string, unknown> = { pngBase64 };
  if (layersJson !== undefined) payload.layersJson = layersJson;
  return apiJson<SaveModelagemCompositionResult>(
    `/api/orders/${orderId}/modelagem/composition`,
    {
      method: "POST",
      auth: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function updateOrderModelagemSpecs(
  orderId: string,
  body: OrderModelagemSpecsPayload,
): Promise<OrderDetail> {
  return apiJson<OrderDetail>(`/api/orders/${orderId}/modelagem/specs`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ── Design Templates ── */

export type DesignTemplateCategory =
  | "ANIVERSARIOS"
  | "MARCO_MULHER"
  | "FIM_DE_ANO"
  | "FINALISTAS"
  | "GRUPOS"
  | "IGREJAS"
  | "OUTROS";

export const DESIGN_TEMPLATE_CATEGORY_LABELS: Record<DesignTemplateCategory, string> = {
  ANIVERSARIOS: "Aniversários",
  MARCO_MULHER: "Março Mulher",
  FIM_DE_ANO: "Fim de Ano",
  FINALISTAS: "Finalistas",
  GRUPOS: "Grupos",
  IGREJAS: "Igrejas",
  OUTROS: "Outros",
};

export type DesignTemplateListItem = {
  id: string;
  title: string;
  description: string | null;
  category: DesignTemplateCategory;
  garmentType: string | null;
  previewKey: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  createdBy: { id: string; name: string };
};

export type DesignTemplate = DesignTemplateListItem & {
  layersJson: unknown;
  updatedAt: string;
};

export async function listDesignTemplates(opts?: {
  category?: DesignTemplateCategory;
  all?: boolean;
}): Promise<DesignTemplateListItem[]> {
  const params = new URLSearchParams();
  if (opts?.category) params.set("category", opts.category);
  if (opts?.all) params.set("all", "true");
  const qs = params.toString();
  return apiJson<DesignTemplateListItem[]>(
    qs ? `/api/design-templates?${qs}` : "/api/design-templates",
    { auth: true },
  );
}

export async function getDesignTemplate(id: string): Promise<DesignTemplate> {
  return apiJson<DesignTemplate>(`/api/design-templates/${id}`, { auth: true });
}

export async function createDesignTemplate(body: {
  title: string;
  description?: string;
  category?: DesignTemplateCategory;
  garmentType?: string;
  previewKey?: string;
  layersJson: unknown;
  active?: boolean;
  sortOrder?: number;
}): Promise<DesignTemplate> {
  return apiJson<DesignTemplate>("/api/design-templates", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateDesignTemplate(
  id: string,
  body: Partial<{
    title: string;
    description: string;
    category: DesignTemplateCategory;
    garmentType: string;
    previewKey: string;
    layersJson: unknown;
    active: boolean;
    sortOrder: number;
  }>,
): Promise<DesignTemplate> {
  return apiJson<DesignTemplate>(`/api/design-templates/${id}`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteDesignTemplate(id: string): Promise<void> {
  await apiVoid(`/api/design-templates/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

/**
 * Preview armazenado em disco (`/api/design-templates/previews/...`) —
 * converte para URL absoluta (`NEXT_PUBLIC_API_URL`) porque `<img src>` não envia Bearer.
 */
export function designTemplatePreviewUrl(
  previewKey: string | null | undefined,
): string | undefined {
  if (previewKey == null) return undefined;
  const k = previewKey.trim();
  if (!k) return undefined;
  if (k.startsWith("data:")) return k;
  if (/^https?:\/\//i.test(k)) return k;
  const base = getApiBaseUrl().replace(/\/$/, "");
  const path = k.startsWith("/") ? k : `/${k}`;
  return `${base}${path}`;
}

export async function uploadDesignTemplatePreview(
  file: File,
): Promise<{ previewKey: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/api/design-templates/preview-upload", {
    method: "POST",
    auth: true,
    body: form,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<{ previewKey: string }>;
}

/* ── Galeria da área cliente ── */

export type ClientGalleryItem = {
  id: string;
  title: string;
  description: string | null;
  imageKey: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  createdBy: { id: string; name: string };
};

export async function listClientGalleryItems(opts?: {
  all?: boolean;
}): Promise<ClientGalleryItem[]> {
  const params = new URLSearchParams();
  if (opts?.all) params.set("all", "true");
  const qs = params.toString();
  return apiJson<ClientGalleryItem[]>(
    qs ? `/api/client-gallery?${qs}` : "/api/client-gallery",
    { auth: true },
  );
}

export async function createClientGalleryItem(body: {
  title: string;
  description?: string;
  imageKey: string;
  active?: boolean;
  sortOrder?: number;
}): Promise<ClientGalleryItem> {
  return apiJson<ClientGalleryItem>("/api/client-gallery", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateClientGalleryItem(
  id: string,
  body: Partial<{
    title: string;
    description: string;
    imageKey: string;
    active: boolean;
    sortOrder: number;
  }>,
): Promise<ClientGalleryItem> {
  return apiJson<ClientGalleryItem>(`/api/client-gallery/${id}`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteClientGalleryItem(id: string): Promise<void> {
  await apiVoid(`/api/client-gallery/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export function clientGalleryImageUrl(
  imageKey: string | null | undefined,
): string | undefined {
  if (imageKey == null) return undefined;
  const k = imageKey.trim();
  if (!k) return undefined;
  if (k.startsWith("data:")) return k;
  if (/^https?:\/\//i.test(k)) return k;
  const base = getApiBaseUrl().replace(/\/$/, "");
  const path = k.startsWith("/") ? k : `/${k}`;
  return `${base}${path}`;
}

export async function uploadClientGalleryImage(
  file: File,
): Promise<{ imageKey: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/api/client-gallery/image-upload", {
    method: "POST",
    auth: true,
    body: form,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.json() as Promise<{ imageKey: string }>;
}

/* ─────────────────────────────────────────────
   INSUMOS
   ───────────────────────────────────────────── */

/** Valor livre: lista padrão + itens cadastrados na UI. */
export type InsumoCategoria = string;

export type MovimentoTipo = "ENTRADA" | "SAIDA_MANUAL" | "SAIDA_PEDIDO";

export interface InsumoCatalogLists {
  categorias: string[];
  marcas: string[];
  unidades: string[];
}

export interface Insumo {
  id: string;
  nome: string;
  categoria: string;
  unidade: string;
  custoUnit: string;
  precoVenda?: string | null;
  stockActual: string;
  stockMinimo: string;
  fornecedor?: string | null;
  marca?: string | null;
  notas?: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  consumos?: InsumoConsumo[];
  _count?: { movimentos: number };
}

export interface MovimentoInsumo {
  id: string;
  insumoId: string;
  tipo: MovimentoTipo;
  quantidade: string;
  custoUnit?: string;
  nota?: string;
  orderId?: string;
  userId: string;
  createdAt: string;
  user?: { id: string; name: string };
  order?: { id: string; orderNumber: string };
  /** Presente quando o dashboard inclui relação insumo (nome/unidade para UI). */
  insumo?: { id?: string; nome: string; unidade: string };
}

export interface InsumoConsumo {
  id: string;
  insumoId: string;
  tipoProduto?: string;
  processo?: string;
  qtdPorUnidade: string;
  insumo?: { id: string; nome: string; unidade: string };
}

export interface InsumosDashboard {
  total: number;
  /** Σ(stock × custo unitário), insumos activos (AOA). */
  custoTotalStock?: string;
  alertas: Array<{
    id: string;
    nome: string;
    stock_actual: string;
    stock_minimo: string;
    unidade: string;
  }>;
  recentes: MovimentoInsumo[];
}

export async function getInsumosDashboard(): Promise<InsumosDashboard> {
  return apiJson<InsumosDashboard>("/api/insumos/dashboard", { auth: true });
}

export async function getInsumoCatalogLists(): Promise<InsumoCatalogLists> {
  return apiJson<InsumoCatalogLists>("/api/insumos/catalog-lists", {
    auth: true,
  });
}

export async function addInsumoCatalogItem(body: {
  kind: "categoria" | "marca" | "unidade";
  value: string;
}): Promise<InsumoCatalogLists> {
  return apiJson<InsumoCatalogLists>("/api/insumos/catalog-lists/items", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listInsumos(all = false): Promise<Insumo[]> {
  return apiJson<Insumo[]>(`/api/insumos${all ? "?all=1" : ""}`, {
    auth: true,
  });
}

export async function getInsumo(id: string): Promise<Insumo> {
  return apiJson<Insumo>(`/api/insumos/${id}`, { auth: true });
}

export async function createInsumo(body: {
  nome: string;
  categoria?: string;
  unidade?: string;
  custoUnit?: number;
  precoVenda?: number | null;
  stockActual?: number;
  stockMinimo?: number;
  fornecedor?: string;
  marca?: string;
  notas?: string;
}): Promise<Insumo> {
  return apiJson<Insumo>("/api/insumos", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateInsumo(
  id: string,
  body: Partial<{
    nome: string;
    categoria: string;
    unidade: string;
    custoUnit: number;
    precoVenda: number | null;
    stockMinimo: number;
    fornecedor?: string | null;
    marca?: string | null;
    notas: string;
    activo: boolean;
  }>,
): Promise<Insumo> {
  return apiJson<Insumo>(`/api/insumos/${id}`, {
    method: "PATCH",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteInsumo(id: string): Promise<void> {
  await apiVoid(`/api/insumos/${id}`, { method: "DELETE", auth: true });
}

export async function listMovimentos(
  insumoId: string,
  limit = 100,
): Promise<MovimentoInsumo[]> {
  return apiJson<MovimentoInsumo[]>(
    `/api/insumos/${insumoId}/movimentos?limit=${limit}`,
    { auth: true },
  );
}

export async function addMovimento(
  insumoId: string,
  body: { tipo: MovimentoTipo; quantidade: number; custoUnit?: number; nota?: string },
): Promise<MovimentoInsumo> {
  return apiJson<MovimentoInsumo>(`/api/insumos/${insumoId}/movimentos`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listConsumos(): Promise<InsumoConsumo[]> {
  return apiJson<InsumoConsumo[]>("/api/insumos/consumos/list", { auth: true });
}

export async function createConsumo(body: {
  insumoId: string;
  tipoProduto?: string;
  processo?: string;
  qtdPorUnidade: number;
}): Promise<InsumoConsumo> {
  return apiJson<InsumoConsumo>("/api/insumos/consumos", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteConsumo(id: string): Promise<void> {
  await apiVoid(`/api/insumos/consumos/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

/* ─── Financeiro (razão, caixa PDV) ─── */

export type FinancePdvSessionCurrent = {
  id: string;
  status: string;
  openingFloat: string;
  openedAt: string;
  openedById: string;
  closedAt: string | null;
  closedById: string | null;
  declaredCash: string | null;
  expectedCash: string | null;
  cashDifference: string | null;
  closeNotes: string | null;
  openedBy: { id: string; name: string };
  closedBy?: { id: string; name: string } | null;
};

export type FinanceSalesSummary = {
  from: string;
  to: string;
  entryCount: number;
  totalRevenue: number;
  currency: string;
  balcaoRevenue: number;
  onlineRevenue: number;
  avgTicket: number;
  byOrigin: Record<string, number>;
  byPaymentMethod: Record<string, number>;
};

export type FinanceLedgerRow = {
  id: string;
  entryType: string;
  amount: string;
  currency: string;
  reference: string | null;
  orderId: string | null;
  userId: string | null;
  pdvSessionId: string | null;
  metadata: unknown;
  createdAt: string;
  motive: string;
};

export type FinanceBalcaoRetailMargin = {
  from: string;
  to: string;
  revenue: number;
  cost: number;
  margin: number;
  balcaoOrderCount: number;
  currency: string;
};

export type FinanceOpenSessionSummary = {
  sessionId: string;
  openedAt: string;
  openingFloat: number;
  cashSalesTotal: number;
  nonCashSalesTotal: number;
  /** Dinheiro adicionado manualmente durante o turno (suprimentos). */
  supplementsTotal: number;
  /** Total de saídas de numerário registadas durante o turno. */
  withdrawalsTotalAbs: number;
  expectedCash: number;
  saleCount: number;
  byPaymentMethod: Record<string, number>;
};

export type FinancePdvSessionHistoryRow = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  declaredCash: string | null;
  expectedCash: string | null;
  cashDifference: string | null;
  closeNotes: string | null;
  openedBy: { id: string; name: string };
  closedBy: { id: string; name: string } | null;
  /** Relatório de fecho (Z), gravado quando o turno encerra — útil para reimpressão pela API. */
  closingSnapshot?: unknown;
};

function financeRangeQuery(from: string, to: string, take?: number): string {
  const p = new URLSearchParams();
  p.set("from", from);
  p.set("to", to);
  if (take != null) p.set("take", String(take));
  return p.toString();
}

function financeLedgerQuery(
  from: string,
  to: string,
  opts?: {
    take?: number;
    paymentMethod?: string;
    orderOrigin?: string;
  },
): string {
  const p = new URLSearchParams();
  p.set("from", from);
  p.set("to", to);
  if (opts?.take != null) p.set("take", String(opts.take));
  if (opts?.paymentMethod) p.set("paymentMethod", opts.paymentMethod);
  if (opts?.orderOrigin) p.set("orderOrigin", opts.orderOrigin);
  return p.toString();
}

export async function getFinanceOpenSessionSummary(): Promise<FinanceOpenSessionSummary | null> {
  const data = await apiJson<{ summary: FinanceOpenSessionSummary | null }>(
    "/api/finance/pdv-session/current/summary",
    { auth: true },
  );
  return data.summary ?? null;
}

export async function listFinancePdvSessionHistory(
  take = 15,
): Promise<FinancePdvSessionHistoryRow[]> {
  const p = new URLSearchParams();
  p.set("take", String(take));
  return apiJson<FinancePdvSessionHistoryRow[]>(
    `/api/finance/pdv-session/history?${p.toString()}`,
    { auth: true },
  );
}

export async function getFinancePdvSessionCurrent(): Promise<FinancePdvSessionCurrent | null> {
  const data = await apiJson<{ session: FinancePdvSessionCurrent | null }>(
    "/api/finance/pdv-session/current",
    { auth: true },
  );
  return data.session ?? null;
}

export async function openFinancePdvSession(openingFloat: number) {
  return apiJson<FinancePdvSessionCurrent>("/api/finance/pdv-session/open", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openingFloat }),
  });
}

export type FinancePdvClosingResponse = {
  updated: FinancePdvSessionCurrent;
  closingReport: PdvCashZReportSnapshot;
};

export type FinancePdvMovementDuringSessionRow = {
  id: string;
  side: "withdrawal" | "supplement";
  amount: number;
  justification: string;
  createdAt: string;
};

export async function listFinancePdvMovementsDuringSession(): Promise<
  FinancePdvMovementDuringSessionRow[]
> {
  const data = await apiJson<{ movements: FinancePdvMovementDuringSessionRow[] }>(
    "/api/finance/pdv-session/current/movements",
    { auth: true },
  );
  return data.movements ?? [];
}

export async function recordFinancePdvSupplement(
  amount: number,
  justification: string,
): Promise<{ id: string }> {
  return apiJson<{ id: string }>("/api/finance/pdv-session/movement/supplement", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, justification }),
  });
}

export async function recordFinancePdvWithdrawal(
  amount: number,
  justification: string,
): Promise<{ id: string }> {
  return apiJson<{ id: string }>("/api/finance/pdv-session/movement/withdrawal", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, justification }),
  });
}

export async function closeFinancePdvSession(payload: {
  declaredCash: number;
  closeNotes?: string;
  /** Saúdas apenas no momento do fecho (cada linha vira entrada imutável no razão antes do cálculo). */
  withdrawalsAtClose?: Array<{ amount: number; justification: string }>;
}): Promise<FinancePdvClosingResponse> {
  return apiJson<FinancePdvClosingResponse>("/api/finance/pdv-session/close", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getFinanceSalesSummary(
  from: string,
  to: string,
): Promise<FinanceSalesSummary> {
  return apiJson<FinanceSalesSummary>(
    `/api/finance/sales-summary?${financeRangeQuery(from, to)}`,
    { auth: true },
  );
}

export async function listFinanceLedger(
  from: string,
  to: string,
  take = 200,
  filters?: { paymentMethod?: string; orderOrigin?: string },
): Promise<FinanceLedgerRow[]> {
  return apiJson<FinanceLedgerRow[]>(
    `/api/finance/ledger?${financeLedgerQuery(from, to, { ...filters, take })}`,
    { auth: true },
  );
}

export async function downloadFinanceLedgerCsv(
  from: string,
  to: string,
  filters?: { paymentMethod?: string; orderOrigin?: string },
): Promise<Blob> {
  const res = await apiFetch(
    `/api/finance/export/ledger.csv?${financeLedgerQuery(from, to, filters)}`,
    { auth: true },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.blob();
}

export async function getFinanceBalcaoRetailMargin(
  from: string,
  to: string,
): Promise<FinanceBalcaoRetailMargin> {
  return apiJson<FinanceBalcaoRetailMargin>(
    `/api/finance/margin/balcao-retail?${financeRangeQuery(from, to)}`,
    { auth: true },
  );
}

export async function downloadFinanceSalesCsv(
  from: string,
  to: string,
): Promise<Blob> {
  const res = await apiFetch(
    `/api/finance/export/sales.csv?${financeRangeQuery(from, to)}`,
    { auth: true },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res.blob();
}

/** ─── Fluxo de caixa (Admin) ───────────────────────────────────────────── */

export type CashFlowGrain = "daily" | "monthly" | "yearly";

export type TreasuryOpeningApi = {
  snapshotDate: string;
  amount: number;
  currency: string;
  notes: string | null;
  updatedAt: string;
};

export async function upsertFinanceTreasuryOpening(payload: {
  snapshotDate: string;
  amount: number;
  notes?: string;
}): Promise<{ id: string; snapshotDate: Date; amount: unknown } | unknown> {
  return apiJson("/api/finance/treasury/opening", {
    method: "PUT",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getFinanceTreasuryOpening(
  date: string,
): Promise<TreasuryOpeningApi | null> {
  const p = new URLSearchParams();
  p.set("date", date.slice(0, 10));
  const data = await apiJson<TreasuryOpeningApi | null>(
    `/api/finance/treasury/opening?${p.toString()}`,
    { auth: true },
  );
  return data;
}

export async function postFinanceCashFlowReceipt(payload: {
  amount: number;
  category: string;
  description: string;
  reference?: string;
}): Promise<{ ok: true }> {
  return apiJson("/api/finance/cash-flow/receipt-other", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function postFinanceCashFlowExpense(payload: {
  amount: number;
  category: string;
  description: string;
}): Promise<{ ok: true }> {
  return apiJson("/api/finance/cash-flow/expense", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type CashFlowPaymentBuckets = {
  DINHEIRO: number;
  TPA: number;
  TRANSFERENCIA: number;
  OUTROS: number;
};

export type CashFlowReportApi = {
  currency: string;
  granularity: CashFlowGrain;
  periodFrom: string;
  periodTo: string;
  openingBalance: number;
  totals: { receipts: number; payments: number; net: number };
  closingBalance: number;
  paymentBucketsReceiptsAbsolute: CashFlowPaymentBuckets;
  paymentBucketsPctOfReceiptMix: CashFlowPaymentBuckets;
  salePaymentMixTotal: number;
  periods: Array<{
    periodKey: string;
    receipts: number;
    payments: number;
    net: number;
    cumulativeClosing: number;
  }>;
  ledgerMovements: Array<{
    id: string;
    occurredAt: string;
    classification: string;
    direction: "IN" | "OUT";
    amount: number;
    motive: string;
  }>;
  projections: Array<{
    id: string;
    expectedDate: string;
    direction: "IN" | "OUT";
    amount: number;
    currency: string;
    category: string;
    description: string | null;
    createdAt: string;
  }>;
  projectionsSummaryInRange: {
    expectedIn: number;
    expectedOut: number;
    netProjectedInRange: number;
  };
  futureProjectionsNetFromToday: number;
  noteReceiptMixPct: string | null;
};

function cashFlowReportQuery(opts: {
  from: string;
  to: string;
  granularity?: CashFlowGrain;
  openingBalanceOverride?: number;
}) {
  const p = new URLSearchParams();
  p.set("from", opts.from.slice(0, 10));
  p.set("to", opts.to.slice(0, 10));
  if (opts.granularity) p.set("granularity", opts.granularity);
  if (
    typeof opts.openingBalanceOverride === "number" &&
    Number.isFinite(opts.openingBalanceOverride)
  ) {
    p.set("openingBalanceOverride", String(opts.openingBalanceOverride));
  }
  return p.toString();
}

export async function getFinanceCashFlowReport(opts: {
  from: string;
  to: string;
  granularity?: CashFlowGrain;
  openingBalanceOverride?: number;
}): Promise<CashFlowReportApi> {
  const qs = cashFlowReportQuery(opts);
  return apiJson<CashFlowReportApi>(`/api/finance/cash-flow/report?${qs}`, {
    auth: true,
  });
}

export async function listFinanceCashFlowProjections(from: string, to: string) {
  const p = new URLSearchParams();
  p.set("from", from.slice(0, 10));
  p.set("to", to.slice(0, 10));
  return apiJson<
    CashFlowReportApi["projections"]
  >(`/api/finance/cash-flow/projections?${p.toString()}`, { auth: true });
}

export async function postFinanceCashFlowProjection(payload: {
  expectedDate: string;
  direction: "IN" | "OUT";
  amount: number;
  category: string;
  description: string;
}) {
  return apiJson(`/api/finance/cash-flow/projection`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteFinanceCashFlowProjection(id: string): Promise<{ ok: true }> {
  return apiJson(`/api/finance/cash-flow/projection/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
  });
}
