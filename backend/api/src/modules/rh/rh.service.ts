import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { UpsertRhProfileDto } from './dto/upsert-rh-profile.dto';
import { CreateRhSalaryPaymentDto } from './dto/create-rh-salary-payment.dto';
import {
  RhDailyPunchDto,
  UpsertRhDailyDto,
} from './dto/upsert-rh-daily.dto';
import {
  CreateRhAttendanceDto,
  CreateRhDocumentDto,
} from './dto/create-rh-document.dto';
import type {
  RhAttendanceRecord,
  RhAttendanceView,
  RhCollaboratorView,
  RhDailyAttendanceRecord,
  RhDailyAttendanceView,
  RhDocument,
  RhDocumentType,
  RhDocumentView,
  RhEmployeeProfile,
  RhOrgNode,
  RhOverview,
  RhPayrollLine,
  RhSalaryBalanceLine,
  RhSalaryPayment,
  RhSalaryPaymentView,
  RhSalarySituation,
} from './rh.types';

const PROFILES_KEY = 'rh_employee_profiles';
const DOCUMENTS_KEY = 'rh_documents';
const ATTENDANCE_KEY = 'rh_attendance';
const DAILY_KEY = 'rh_daily_attendance';
const PAYMENTS_KEY = 'rh_salary_payments';

const RH_DOCUMENT_TYPES = new Set<RhDocumentType>([
  'BI',
  'Contrato',
  'NIF',
  'Certificado',
  'Extrato',
  'Outro',
]);

export type MemoryUploadedRhFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const ROLE_DEFAULTS: Record<
  Exclude<UserRole, 'CLIENT'>,
  { cargo: string; departamento: string }
> = {
  [UserRole.ADMIN]: { cargo: 'Administrador', departamento: 'Direção' },
  [UserRole.ATTENDANT]: { cargo: 'Atendente', departamento: 'Balcão' },
  [UserRole.DESIGNER]: { cargo: 'Designer', departamento: 'Produção & design' },
  [UserRole.COLLABORATOR]: { cargo: 'Colaborador', departamento: 'Operações' },
};

@Injectable()
export class RhService {
  private readonly documentAllowedMime = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/pdf',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly finance: FinanceService,
  ) {}

  private uploadBaseDir(): string {
    const base = this.config.get<string>('uploadDir') ?? 'uploads';
    return join(process.cwd(), base);
  }

  private documentDir(userId: string, documentId: string): string {
    return join(this.uploadBaseDir(), 'rh', userId, documentId);
  }

  private extForMime(mime: string): string {
    if (mime === 'image/png') return '.png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
    if (mime === 'application/pdf') return '.pdf';
    return '';
  }

  private normalizeDocument(doc: RhDocument): RhDocument {
    return {
      ...doc,
      fileKey: doc.fileKey ?? null,
      fileName: doc.fileName ?? null,
      fileMime: doc.fileMime ?? null,
      fileSizeBytes:
        typeof doc.fileSizeBytes === 'number' ? doc.fileSizeBytes : null,
    };
  }

  private toDocumentView(
    doc: RhDocument,
    colaborador: string,
  ): RhDocumentView {
    const normalized = this.normalizeDocument(doc);
    return {
      ...normalized,
      colaborador,
      hasFile: Boolean(normalized.fileKey),
    };
  }

  private async findDocumentById(documentId: string): Promise<RhDocument> {
    const documents = await this.getDocuments();
    const doc = documents.find((item) => item.id === documentId);
    if (!doc) {
      throw new NotFoundException('Documento não encontrado.');
    }
    return this.normalizeDocument(doc);
  }

  private async removeDocumentFile(doc: RhDocument): Promise<void> {
    if (!doc.fileKey) return;
    const fullPath = join(
      this.documentDir(doc.userId, doc.id),
      doc.fileKey,
    );
    try {
      await unlink(fullPath);
    } catch {
      /* ficheiro já removido */
    }
  }

  private currentPeriodKey(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private todayIsoDate(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private currentTimeHm(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  weekdaysInMonth(periodKey: string): number {
    const [yearRaw, monthRaw] = periodKey.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return 22;
    }
    let count = 0;
    const cursor = new Date(year, month - 1, 1);
    while (cursor.getMonth() === month - 1) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count || 22;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private formatAdmissao(date: Date): string {
    return date.toLocaleDateString('pt-PT');
  }

  private async getDailyRecords(): Promise<RhDailyAttendanceRecord[]> {
    const raw = await this.readJson<RhDailyAttendanceRecord[]>(DAILY_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  private dailyKey(userId: string, date: string): string {
    return `${userId}:${date}`;
  }

  private async getSalaryPayments(): Promise<RhSalaryPayment[]> {
    const raw = await this.readJson<RhSalaryPayment[]>(PAYMENTS_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  private computePayroll(
    collaborators: RhCollaboratorView[],
    dailyRecords: RhDailyAttendanceRecord[],
    periodKey: string,
  ): RhPayrollLine[] {
    const diasUteisMes = this.weekdaysInMonth(periodKey);

    return collaborators.map((collaborator) => {
      const userDaily = dailyRecords.filter(
        (row) =>
          row.userId === collaborator.userId && row.date.startsWith(periodKey),
      );
      const diasPresentes = userDaily.filter((row) => row.status === 'presente').length;
      const faltasJustificadas = userDaily.filter(
        (row) => row.status === 'falta_justificada',
      ).length;
      const faltasInjustificadas = userDaily.filter(
        (row) => row.status === 'falta_injustificada',
      ).length;

      const salarioBaseAoa = collaborator.salarioBaseAoa;
      const valorDiaAoa =
        diasUteisMes > 0 ? this.roundMoney(salarioBaseAoa / diasUteisMes) : 0;
      const descontoFaltasAoa = this.roundMoney(
        valorDiaAoa * faltasInjustificadas,
      );
      const salarioAjustadoAoa = this.roundMoney(
        Math.max(0, salarioBaseAoa - descontoFaltasAoa),
      );
      const inssTrabalhadorAoa = this.roundMoney(salarioAjustadoAoa * 0.03);
      const inssEntidadeAoa = this.roundMoney(salarioAjustadoAoa * 0.08);
      const liquidoAntesIrtAoa = this.roundMoney(
        salarioAjustadoAoa - inssTrabalhadorAoa,
      );

      return {
        userId: collaborator.userId,
        colaborador: collaborator.nome,
        salarioBaseAoa,
        diasUteisMes,
        diasPresentes,
        faltasJustificadas,
        faltasInjustificadas,
        valorDiaAoa,
        descontoFaltasAoa,
        salarioAjustadoAoa,
        inssTrabalhadorAoa,
        inssEntidadeAoa,
        liquidoAntesIrtAoa,
      };
    });
  }

  private resolveSalarySituation(
    liquidoDevidoAoa: number,
    totalPagoSalarioAoa: number,
    totalAdiantamentoAoa: number,
    totalPagoAoa: number,
    saldoPendenteAoa: number,
  ): RhSalarySituation {
    if (liquidoDevidoAoa <= 0) return 'sem_salario';
    if (totalPagoAoa > liquidoDevidoAoa) return 'com_adiantamento';
    if (saldoPendenteAoa <= 0) return 'pago';
    if (totalPagoAoa > 0) return 'parcial';
    if (totalAdiantamentoAoa > 0 && totalPagoSalarioAoa === 0) return 'parcial';
    return 'em_atraso';
  }

  private computeSalaryBalances(
    payroll: RhPayrollLine[],
    payments: RhSalaryPayment[],
    periodKey: string,
  ): RhSalaryBalanceLine[] {
    return payroll.map((line) => {
      const userPayments = payments.filter(
        (payment) =>
          payment.userId === line.userId && payment.periodKey === periodKey,
      );
      const totalPagoSalarioAoa = this.roundMoney(
        userPayments
          .filter((payment) => payment.tipo === 'salario')
          .reduce((acc, payment) => acc + payment.valorAoa, 0),
      );
      const totalAdiantamentoAoa = this.roundMoney(
        userPayments
          .filter((payment) => payment.tipo === 'adiantamento')
          .reduce((acc, payment) => acc + payment.valorAoa, 0),
      );
      const totalPagoAoa = this.roundMoney(
        totalPagoSalarioAoa + totalAdiantamentoAoa,
      );
      const liquidoDevidoAoa = line.liquidoAntesIrtAoa;
      const saldoPendenteAoa = this.roundMoney(
        Math.max(0, liquidoDevidoAoa - totalPagoAoa),
      );
      const saldoCreditoAoa = this.roundMoney(
        Math.max(0, totalPagoAoa - liquidoDevidoAoa),
      );

      return {
        ...line,
        liquidoDevidoAoa,
        totalPagoSalarioAoa,
        totalAdiantamentoAoa,
        totalPagoAoa,
        saldoPendenteAoa,
        saldoCreditoAoa,
        situacao: this.resolveSalarySituation(
          liquidoDevidoAoa,
          totalPagoSalarioAoa,
          totalAdiantamentoAoa,
          totalPagoAoa,
          saldoPendenteAoa,
        ),
      };
    });
  }

  private buildAttendanceSummary(
    collaborators: RhCollaboratorView[],
    dailyRecords: RhDailyAttendanceRecord[],
    periodKey: string,
  ): RhAttendanceView[] {
    return collaborators.map((collaborator) => {
      const userDaily = dailyRecords.filter(
        (row) =>
          row.userId === collaborator.userId && row.date.startsWith(periodKey),
      );
      return {
        id: `${collaborator.userId}-${periodKey}`,
        userId: collaborator.userId,
        periodKey,
        colaborador: collaborator.nome,
        diasTrabalhados: userDaily.filter((row) => row.status === 'presente').length,
        faltasJustificadas: userDaily.filter(
          (row) => row.status === 'falta_justificada',
        ).length,
        faltasInjustificadas: userDaily.filter(
          (row) => row.status === 'falta_injustificada',
        ).length,
        atrasos: 0,
        horasExtra: 0,
        saldoFeriasDias: 0,
      };
    });
  }

  private async readJson<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row?.value) return fallback;
    return row.value as T;
  }

  private async writeJson(key: string, value: unknown): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
  }

  private async getProfilesMap(): Promise<Record<string, RhEmployeeProfile>> {
    return this.readJson<Record<string, RhEmployeeProfile>>(PROFILES_KEY, {});
  }

  private async getDocuments(): Promise<RhDocument[]> {
    const raw = await this.readJson<RhDocument[]>(DOCUMENTS_KEY, []);
    return Array.isArray(raw) ? raw.map((doc) => this.normalizeDocument(doc)) : [];
  }

  private async getAttendance(): Promise<RhAttendanceRecord[]> {
    const raw = await this.readJson<RhAttendanceRecord[]>(ATTENDANCE_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  private mergeProfile(
    user: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      role: UserRole;
      createdAt: Date;
    },
    stored: RhEmployeeProfile | undefined,
  ): RhCollaboratorView {
    const roleDefaults =
      user.role !== UserRole.CLIENT
        ? ROLE_DEFAULTS[user.role as Exclude<UserRole, 'CLIENT'>]
        : { cargo: '—', departamento: '—' };

    return {
      userId: user.id,
      nome: user.name,
      email: user.email,
      telefone: user.phone,
      role: user.role,
      nif: stored?.nif?.trim() ?? '',
      iban: stored?.iban?.trim() ?? '',
      cargo: stored?.cargo?.trim() || roleDefaults.cargo,
      departamento: stored?.departamento?.trim() || roleDefaults.departamento,
      gestorDireto: stored?.gestorDireto?.trim() ?? '',
      dataAdmissao:
        stored?.dataAdmissao?.trim() || this.formatAdmissao(user.createdAt),
      salarioBaseAoa:
        typeof stored?.salarioBaseAoa === 'number' && stored.salarioBaseAoa >= 0
          ? stored.salarioBaseAoa
          : 0,
      estadoContrato: stored?.estadoContrato ?? 'Ativo',
      hasRhProfile: Boolean(stored),
    };
  }

  private buildOrgChart(collaborators: RhCollaboratorView[]): RhOrgNode[] {
    const byManager = new Map<string, Set<string>>();

    for (const c of collaborators) {
      const manager = c.gestorDireto.trim() || 'Direção Geral';
      if (!byManager.has(manager)) {
        byManager.set(manager, new Set());
      }
      if (c.nome !== manager) {
        byManager.get(manager)!.add(c.nome);
      }
    }

    const managerNames = new Set(collaborators.map((c) => c.nome));
    if (!byManager.has('Direção Geral')) {
      byManager.set('Direção Geral', new Set());
    }
    for (const c of collaborators) {
      if (c.role === UserRole.ADMIN && !c.gestorDireto.trim()) {
        byManager.get('Direção Geral')!.add(c.nome);
      }
    }

    return Array.from(byManager.entries())
      .filter(([gestor, equipa]) => gestor !== 'Direção Geral' || equipa.size > 0)
      .map(([gestor, equipa]) => ({
        gestor,
        equipa: Array.from(equipa).sort((a, b) => a.localeCompare(b, 'pt')),
      }))
      .sort((a, b) => a.gestor.localeCompare(b.gestor, 'pt'));
  }

  async getOverview(periodKey?: string): Promise<RhOverview> {
    const period = periodKey?.trim() || this.currentPeriodKey();

    const [staff, profilesMap, documents, dailyAll, paymentsAll] =
      await Promise.all([
      this.prisma.user.findMany({
        where: { role: { not: UserRole.CLIENT } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      }),
      this.getProfilesMap(),
      this.getDocuments(),
      this.getDailyRecords(),
      this.getSalaryPayments(),
    ]);

    const collaborators = staff.map((user) =>
      this.mergeProfile(user, profilesMap[user.id]),
    );

    const nameById = new Map(collaborators.map((c) => [c.userId, c.nome]));

    const documentsView: RhDocumentView[] = documents
      .map((doc) => this.toDocumentView(doc, nameById.get(doc.userId) ?? '—'))
      .sort((a, b) => b.referencia.localeCompare(a.referencia));

    const dailyAttendance: RhDailyAttendanceView[] = dailyAll
      .filter((row) => row.date.startsWith(period))
      .map((row) => ({
        ...row,
        colaborador: nameById.get(row.userId) ?? '—',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const attendance = this.buildAttendanceSummary(
      collaborators,
      dailyAll,
      period,
    );

    const payroll = this.computePayroll(collaborators, dailyAll, period);

    const salaryPayments: RhSalaryPaymentView[] = paymentsAll
      .filter((payment) => payment.periodKey === period)
      .map((payment) => ({
        ...payment,
        colaborador: nameById.get(payment.userId) ?? '—',
      }))
      .sort((a, b) => b.dataPagamento.localeCompare(a.dataPagamento));

    const salaryBalances = this.computeSalaryBalances(
      payroll,
      paymentsAll,
      period,
    );

    return {
      periodKey: period,
      collaborators,
      documents: documentsView,
      attendance,
      dailyAttendance,
      payroll,
      salaryPayments,
      salaryBalances,
      orgChart: this.buildOrgChart(collaborators),
    };
  }

  private async assertStaffUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user || user.role === UserRole.CLIENT) {
      throw new NotFoundException('Colaborador não encontrado.');
    }
    return user;
  }

  async upsertProfile(userId: string, dto: UpsertRhProfileDto) {
    await this.assertStaffUser(userId);
    const profiles = await this.getProfilesMap();
    const current = profiles[userId];

    const merged: RhEmployeeProfile = {
      userId,
      nif: dto.nif !== undefined ? dto.nif.trim() : (current?.nif ?? ''),
      iban: dto.iban !== undefined ? dto.iban.trim() : (current?.iban ?? ''),
      cargo: dto.cargo !== undefined ? dto.cargo.trim() : (current?.cargo ?? ''),
      departamento:
        dto.departamento !== undefined
          ? dto.departamento.trim()
          : (current?.departamento ?? ''),
      gestorDireto:
        dto.gestorDireto !== undefined
          ? dto.gestorDireto.trim()
          : (current?.gestorDireto ?? ''),
      dataAdmissao:
        dto.dataAdmissao !== undefined
          ? dto.dataAdmissao.trim()
          : (current?.dataAdmissao ?? ''),
      salarioBaseAoa:
        typeof dto.salarioBaseAoa === 'number'
          ? dto.salarioBaseAoa
          : (current?.salarioBaseAoa ?? 0),
      estadoContrato: dto.estadoContrato ?? current?.estadoContrato ?? 'Ativo',
    };

    profiles[userId] = merged;
    await this.writeJson(PROFILES_KEY, profiles);
    return merged;
  }

  async addDocument(
    dto: CreateRhDocumentDto,
    file: MemoryUploadedRhFile,
  ): Promise<RhDocumentView> {
    await this.assertStaffUser(dto.userId);
    if (!dto.referencia?.trim()) {
      throw new BadRequestException('A referência do documento é obrigatória.');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Anexa o ficheiro do documento (PNG, JPG ou PDF).',
      );
    }
    if (!this.documentAllowedMime.has(file.mimetype)) {
      throw new BadRequestException(
        'Formato não suportado. Usa PNG, JPG ou PDF.',
      );
    }

    const docId = randomUUID();
    const ext = extname(file.originalname).toLowerCase();
    const safeExt =
      ext.length > 0 && ext.length <= 8 && /^\.[a-z0-9.]+$/.test(ext)
        ? ext
        : '';
    const fileKey = `${randomUUID()}${safeExt || this.extForMime(file.mimetype)}`;
    const dir = this.documentDir(dto.userId, docId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileKey), file.buffer);

    const doc: RhDocument = {
      id: docId,
      userId: dto.userId,
      tipo: dto.tipo,
      referencia: dto.referencia.trim(),
      validade: dto.validade?.trim() || '-',
      estado: dto.estado,
      fileKey,
      fileName: file.originalname.slice(0, 512),
      fileMime: file.mimetype,
      fileSizeBytes: file.size,
    };

    const documents = await this.getDocuments();
    documents.unshift(doc);
    await this.writeJson(DOCUMENTS_KEY, documents);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { name: true },
    });

    return this.toDocumentView(doc, user?.name ?? '—');
  }

  async getDocumentFileStream(documentId: string) {
    const doc = await this.findDocumentById(documentId);
    if (!doc.fileKey) {
      throw new NotFoundException('Este documento não tem anexo.');
    }
    const fullPath = join(this.documentDir(doc.userId, doc.id), doc.fileKey);
    try {
      await access(fullPath);
    } catch {
      throw new NotFoundException('Ficheiro do documento não encontrado.');
    }
    return {
      stream: createReadStream(fullPath),
      mimeType: doc.fileMime ?? 'application/octet-stream',
      downloadName: doc.fileName ?? `documento-${doc.id}`,
    };
  }

  async deleteDocument(documentId: string): Promise<void> {
    const documents = await this.getDocuments();
    const index = documents.findIndex((item) => item.id === documentId);
    if (index < 0) {
      throw new NotFoundException('Documento não encontrado.');
    }
    const [removed] = documents.splice(index, 1);
    await this.removeDocumentFile(removed);
    await this.writeJson(DOCUMENTS_KEY, documents);
  }

  parseCreateDocumentBody(body: {
    userId?: string;
    tipo?: string;
    referencia?: string;
    validade?: string;
    estado?: string;
  }): CreateRhDocumentDto {
    const userId = body.userId?.trim();
    const tipo = body.tipo?.trim() as RhDocumentType | undefined;
    const referencia = body.referencia?.trim();
    const validade = body.validade?.trim();
    const estado = body.estado?.trim();

    if (!userId) {
      throw new BadRequestException('Indica o colaborador.');
    }
    if (!tipo || !RH_DOCUMENT_TYPES.has(tipo)) {
      throw new BadRequestException('Tipo de documento inválido.');
    }
    if (!referencia) {
      throw new BadRequestException('A referência do documento é obrigatória.');
    }
    if (
      !estado ||
      !['Carregado', 'Pendente', 'Expirado'].includes(estado)
    ) {
      throw new BadRequestException('Estado do documento inválido.');
    }

    return {
      userId,
      tipo,
      referencia,
      validade: validade || undefined,
      estado: estado as CreateRhDocumentDto['estado'],
    };
  }

  async upsertDaily(dto: UpsertRhDailyDto): Promise<RhDailyAttendanceView> {
    await this.assertStaffUser(dto.userId);

    const daily = await this.getDailyRecords();
    const index = daily.findIndex(
      (row) => row.userId === dto.userId && row.date === dto.date,
    );

    const merged: RhDailyAttendanceRecord = {
      id: index >= 0 ? daily[index].id : randomUUID(),
      userId: dto.userId,
      date: dto.date,
      status: dto.status,
      entrada:
        dto.status === 'presente'
          ? dto.entrada?.trim() || daily[index]?.entrada || '08:00'
          : null,
      saida:
        dto.status === 'presente'
          ? dto.saida?.trim() || daily[index]?.saida || null
          : null,
    };

    if (index >= 0) {
      daily[index] = merged;
    } else {
      daily.unshift(merged);
    }
    await this.writeJson(DAILY_KEY, daily);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { name: true },
    });

    return { ...merged, colaborador: user?.name ?? '—' };
  }

  async registerPunch(dto: RhDailyPunchDto): Promise<RhDailyAttendanceView> {
    const date = dto.date?.trim() || this.todayIsoDate();
    const hora = dto.hora?.trim() || this.currentTimeHm();
    const daily = await this.getDailyRecords();
    const existing = daily.find(
      (row) => row.userId === dto.userId && row.date === date,
    );

    if (dto.punch === 'entrada') {
      return this.upsertDaily({
        userId: dto.userId,
        date,
        status: 'presente',
        entrada: hora,
        saida: existing?.saida ?? undefined,
      });
    }

    return this.upsertDaily({
      userId: dto.userId,
      date,
      status: 'presente',
      entrada: existing?.entrada ?? hora,
      saida: hora,
    });
  }

  async addAttendance(dto: CreateRhAttendanceDto): Promise<RhAttendanceView> {
    await this.assertStaffUser(dto.userId);
    const periodKey = dto.periodKey?.trim() || this.currentPeriodKey();

    const row: RhAttendanceRecord = {
      id: randomUUID(),
      userId: dto.userId,
      periodKey,
      diasTrabalhados: dto.diasTrabalhados ?? 0,
      faltasJustificadas: dto.faltasJustificadas ?? 0,
      faltasInjustificadas: dto.faltasInjustificadas ?? 0,
      atrasos: dto.atrasos ?? 0,
      horasExtra: dto.horasExtra ?? 0,
      saldoFeriasDias: dto.saldoFeriasDias ?? 0,
    };

    const attendance = await this.getAttendance();
    attendance.unshift(row);
    await this.writeJson(ATTENDANCE_KEY, attendance);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { name: true },
    });

    return { ...row, colaborador: user?.name ?? '—' };
  }

  async createSalaryPayment(
    actor: { id: string; role: UserRole },
    dto: CreateRhSalaryPaymentDto,
  ): Promise<RhSalaryPaymentView> {
    await this.assertStaffUser(dto.userId);
    if (!Number.isFinite(dto.valorAoa) || dto.valorAoa <= 0) {
      throw new BadRequestException('Indica um valor de pagamento válido.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { name: true },
    });
    const colaboradorNome = user?.name ?? '—';

    const payment: RhSalaryPayment = {
      id: randomUUID(),
      userId: dto.userId,
      periodKey: dto.periodKey.trim(),
      tipo: dto.tipo,
      valorAoa: this.roundMoney(dto.valorAoa),
      dataPagamento: dto.dataPagamento?.trim() || this.todayIsoDate(),
      referencia: dto.referencia?.trim() ?? '',
      notas: dto.notas?.trim() ?? '',
      createdAt: new Date().toISOString(),
    };

    const { ledgerEntryId } = await this.finance.recordRhSalaryExpense(actor, {
      rhPaymentId: payment.id,
      rhUserId: payment.userId,
      colaboradorNome,
      periodKey: payment.periodKey,
      tipo: payment.tipo,
      valorAoa: payment.valorAoa,
      referencia: payment.referencia,
      notas: payment.notas,
    });
    payment.ledgerEntryId = ledgerEntryId;

    const payments = await this.getSalaryPayments();
    payments.unshift(payment);
    await this.writeJson(PAYMENTS_KEY, payments);

    return { ...payment, colaborador: colaboradorNome };
  }

  async deleteSalaryPayment(
    actor: { id: string; role: UserRole },
    paymentId: string,
  ): Promise<void> {
    const payments = await this.getSalaryPayments();
    const index = payments.findIndex((payment) => payment.id === paymentId);
    if (index < 0) {
      throw new NotFoundException('Pagamento não encontrado.');
    }

    const payment = payments[index];
    const user = await this.prisma.user.findUnique({
      where: { id: payment.userId },
      select: { name: true },
    });

    await this.finance.reverseRhSalaryExpenseForPayment(actor, {
      rhPaymentId: payment.id,
      colaboradorNome: user?.name ?? '—',
      periodKey: payment.periodKey,
      tipo: payment.tipo,
      valorAoa: payment.valorAoa,
      ledgerEntryId: payment.ledgerEntryId,
    });

    payments.splice(index, 1);
    await this.writeJson(PAYMENTS_KEY, payments);
  }
}
