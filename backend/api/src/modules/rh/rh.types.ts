import { UserRole } from '@prisma/client';

export type RhContractStatus = 'Ativo' | 'Em férias' | 'Licença';

export type RhDayStatus = 'presente' | 'falta_justificada' | 'falta_injustificada';

export type RhDocumentStatus = 'Carregado' | 'Pendente' | 'Expirado';

export type RhDocumentType =
  | 'BI'
  | 'Contrato'
  | 'NIF'
  | 'Certificado'
  | 'Extrato'
  | 'Outro';

export interface RhEmployeeProfile {
  userId: string;
  nif: string;
  iban: string;
  cargo: string;
  departamento: string;
  gestorDireto: string;
  dataAdmissao: string;
  salarioBaseAoa: number;
  estadoContrato: RhContractStatus;
}

export interface RhDocument {
  id: string;
  userId: string;
  tipo: RhDocumentType;
  referencia: string;
  validade: string;
  estado: RhDocumentStatus;
  fileKey?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileSizeBytes?: number | null;
}

export interface RhAttendanceRecord {
  id: string;
  userId: string;
  periodKey: string;
  diasTrabalhados: number;
  faltasJustificadas: number;
  faltasInjustificadas: number;
  atrasos: number;
  horasExtra: number;
  saldoFeriasDias: number;
}

export interface RhDailyAttendanceRecord {
  id: string;
  userId: string;
  date: string;
  status: RhDayStatus;
  entrada: string | null;
  saida: string | null;
}

export interface RhDailyAttendanceView extends RhDailyAttendanceRecord {
  colaborador: string;
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

export type RhSalaryPaymentType = 'salario' | 'adiantamento';

export type RhSalarySituation =
  | 'sem_salario'
  | 'pago'
  | 'em_atraso'
  | 'parcial'
  | 'com_adiantamento';

export interface RhSalaryPayment {
  id: string;
  userId: string;
  periodKey: string;
  tipo: RhSalaryPaymentType;
  valorAoa: number;
  dataPagamento: string;
  referencia: string;
  notas: string;
  createdAt: string;
  /** Saída registada no razão financeiro (fluxo de caixa). */
  ledgerEntryId?: string;
}

export interface RhSalaryPaymentView extends RhSalaryPayment {
  colaborador: string;
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

export interface RhDocumentView extends RhDocument {
  colaborador: string;
  hasFile: boolean;
}

export interface RhAttendanceView extends RhAttendanceRecord {
  colaborador: string;
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

export type UpsertRhProfileInput = Omit<RhEmployeeProfile, 'userId'>;

export type CreateRhDocumentInput = Omit<RhDocument, 'id'>;

export type CreateRhAttendanceInput = Omit<RhAttendanceRecord, 'id'>;
