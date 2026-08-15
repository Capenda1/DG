import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CashFlowProjectionDirection,
  FinancialLedgerEntryType,
  NotificationChannel,
  NotificationStatus,
  OrderOrigin,
  OrderStatus,
  PaymentMethod,
  PdvCashSessionStatus,
  Prisma,
  ProductionProcess,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Campo escalar em `metadata` JSON → string segura (evita `[object Object]`). */
function ledgerMetaScalar(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function metadataIsStoreRetail(metadata: unknown): metadata is {
  lineType: 'STORE_RETAIL';
  insumoId: string;
} {
  if (
    metadata == null ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return false;
  }
  const m = metadata as Record<string, unknown>;
  return m.lineType === 'STORE_RETAIL' && typeof m.insumoId === 'string';
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private buildLedgerWhere(
    from: Date,
    to: Date,
    filters?: { paymentMethod?: PaymentMethod; orderOrigin?: OrderOrigin },
  ): Prisma.FinancialLedgerEntryWhereInput {
    const conditions: Prisma.FinancialLedgerEntryWhereInput[] = [
      { createdAt: { gte: from, lte: to } },
    ];
    if (filters?.paymentMethod) {
      conditions.push({
        metadata: { path: ['paymentMethod'], equals: filters.paymentMethod },
      });
    }
    if (filters?.orderOrigin) {
      conditions.push({
        metadata: { path: ['orderOrigin'], equals: filters.orderOrigin },
      });
    }
    return conditions.length === 1 ? conditions[0] : { AND: conditions };
  }

  assertFinanceStaff(role: UserRole): void {
    if (role !== UserRole.ADMIN && role !== UserRole.ATTENDANT) {
      throw new ForbiddenException(
        'Apenas administrador ou atendente pode aceder ao módulo financeiro.',
      );
    }
  }

  assertFinanceAdmin(role: UserRole): void {
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas administrador pode aceder a esta função.',
      );
    }
  }

  /**
   * Regista receita no razão (imutável). Chamado na mesma transação que submete o pedido.
   */
  async recordLedgerEntryForOrderPayment(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      orderNumber: string;
      actorId: string;
      paymentMethod: PaymentMethod;
      orderOrigin: OrderOrigin;
      attendantId: string | null;
      grossAmount: number;
      discountAmount: number;
      netAmount: number;
      currency: string;
    },
  ): Promise<void> {
    let pdvSessionId: string | null = null;
    if (params.orderOrigin === OrderOrigin.BALCAO) {
      const open = await tx.pdvCashSession.findFirst({
        where: { status: PdvCashSessionStatus.OPEN },
        select: { id: true },
      });
      if (!open) {
        throw new BadRequestException(
          'Abre um turno de caixa antes de registar um pagamento do balcão.',
        );
      }
      pdvSessionId = open.id;
    }

    const cur = params.currency.trim().slice(0, 3).toUpperCase() || 'AOA';

    await tx.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.SALE_PAYMENT,
        amount: new Prisma.Decimal(roundMoney(params.netAmount)),
        currency: cur,
        orderId: params.orderId,
        userId: params.actorId,
        pdvSessionId,
        reference: params.orderNumber.slice(0, 64),
        metadata: {
          paymentMethod: params.paymentMethod,
          orderOrigin: params.orderOrigin,
          grossAmount: roundMoney(params.grossAmount),
          discountAmount: roundMoney(params.discountAmount),
          attendantId: params.attendantId,
        },
      },
    });
  }

  /**
   * Cria uma linha compensatória append-only. O saldo líquido do pedido passa
   * a zero sem apagar nem alterar o lançamento original.
   */
  async reverseOrderPaymentForCancellation(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      orderNumber: string;
      actorId: string;
      reason: string;
    },
  ): Promise<number> {
    const entries = await tx.financialLedgerEntry.findMany({
      where: {
        orderId: params.orderId,
        entryType: FinancialLedgerEntryType.SALE_PAYMENT,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        amount: true,
        currency: true,
        metadata: true,
      },
    });
    const net = roundMoney(
      entries.reduce((sum, entry) => sum + Number(entry.amount), 0),
    );
    if (net <= 0) return 0;

    const source = entries.find((entry) => Number(entry.amount) > 0);
    const metadata =
      source?.metadata &&
      typeof source.metadata === 'object' &&
      !Array.isArray(source.metadata)
        ? (source.metadata as Record<string, unknown>)
        : {};
    const paymentMethod = ledgerMetaScalar(metadata.paymentMethod);
    const orderOrigin = ledgerMetaScalar(metadata.orderOrigin);
    let pdvSessionId: string | null = null;
    if (
      orderOrigin === OrderOrigin.BALCAO &&
      paymentMethod === PaymentMethod.PDV_CASH
    ) {
      const open = await tx.pdvCashSession.findFirst({
        where: { status: PdvCashSessionStatus.OPEN },
        select: { id: true },
      });
      if (!open) {
        throw new BadRequestException(
          'Abre um turno de caixa antes de estornar um pagamento em dinheiro do balcão.',
        );
      }
      pdvSessionId = open.id;
    }

    await tx.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.SALE_PAYMENT,
        amount: new Prisma.Decimal(-net),
        currency: source?.currency ?? 'AOA',
        orderId: params.orderId,
        userId: params.actorId,
        pdvSessionId,
        reference: params.orderNumber.slice(0, 64),
        metadata: {
          ...metadata,
          operation: 'ORDER_CANCELLATION_REVERSAL',
          cancellationReason: params.reason,
        },
      },
    });
    return net;
  }

  /** Compensa o estorno quando o administrador reabre o pedido. */
  async reactivateOrderPaymentForReopen(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      orderNumber: string;
      actorId: string;
    },
  ): Promise<number> {
    const entries = await tx.financialLedgerEntry.findMany({
      where: {
        orderId: params.orderId,
        entryType: FinancialLedgerEntryType.SALE_PAYMENT,
      },
      orderBy: { createdAt: 'desc' },
      select: { amount: true, currency: true, metadata: true },
    });
    const net = roundMoney(
      entries.reduce((sum, entry) => sum + Number(entry.amount), 0),
    );
    if (net >= 0) return 0;

    const source = entries.find((entry) => Number(entry.amount) > 0);
    const metadata =
      source?.metadata &&
      typeof source.metadata === 'object' &&
      !Array.isArray(source.metadata)
        ? (source.metadata as Record<string, unknown>)
        : {};
    const paymentMethod = ledgerMetaScalar(metadata.paymentMethod);
    const orderOrigin = ledgerMetaScalar(metadata.orderOrigin);
    let pdvSessionId: string | null = null;
    if (
      orderOrigin === OrderOrigin.BALCAO &&
      paymentMethod === PaymentMethod.PDV_CASH
    ) {
      const open = await tx.pdvCashSession.findFirst({
        where: { status: PdvCashSessionStatus.OPEN },
        select: { id: true },
      });
      if (!open) {
        throw new BadRequestException(
          'Abre um turno de caixa antes de reactivar um pagamento em dinheiro do balcão.',
        );
      }
      pdvSessionId = open.id;
    }

    const amount = Math.abs(net);
    await tx.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.SALE_PAYMENT,
        amount: new Prisma.Decimal(amount),
        currency: source?.currency ?? 'AOA',
        orderId: params.orderId,
        userId: params.actorId,
        pdvSessionId,
        reference: params.orderNumber.slice(0, 64),
        metadata: {
          ...metadata,
          operation: 'ORDER_REOPEN_REACTIVATION',
        },
      },
    });
    return amount;
  }

  ensureBalcaoCashSessionIsOpen(): Promise<void> {
    return this.prisma.pdvCashSession
      .findFirst({
        where: { status: PdvCashSessionStatus.OPEN },
        select: { id: true },
      })
      .then((open) => {
        if (!open) {
          throw new BadRequestException(
            'É obrigatório ter um turno de caixa aberto (Admin → Financeiro) para criar ou concluir pedidos no balcão.',
          );
        }
      });
  }

  getCurrentPdvSession(user: { id: string; role: UserRole }) {
    this.assertFinanceStaff(user.role);
    return this.prisma.pdvCashSession.findFirst({
      where: { status: PdvCashSessionStatus.OPEN },
      include: {
        openedBy: { select: { id: true, name: true } },
      },
    });
  }

  /** Agrega linhas do turno PDV para o esperado em numerário e relatório Z. */
  private summarizePdvLedger(
    openingFloat: number,
    ledgerRows: Array<{
      id: string;
      entryType: FinancialLedgerEntryType;
      amount: Prisma.Decimal;
      createdAt: Date;
      reference: string | null;
      metadata: Prisma.JsonValue | null;
    }>,
  ) {
    let cashSales = 0;
    let nonCashSales = 0;
    const byPaymentMethod: Record<string, number> = {};
    let supplementsTotal = 0;
    let withdrawalsTotalAbs = 0;

    type MvLine = {
      id: string;
      at: string;
      amount: number;
      justification: string;
    };
    const supplementLines: MvLine[] = [];
    const withdrawalLines: MvLine[] = [];

    for (const e of ledgerRows) {
      const amt = Number(e.amount);
      const meta = e.metadata as Record<string, unknown> | null;

      switch (e.entryType) {
        case FinancialLedgerEntryType.SALE_PAYMENT: {
          const pm = ledgerMetaScalar(meta?.paymentMethod);
          byPaymentMethod[pm] = roundMoney((byPaymentMethod[pm] ?? 0) + amt);
          if (pm === PaymentMethod.PDV_CASH) {
            cashSales += amt;
          } else {
            nonCashSales += amt;
          }
          break;
        }
        case FinancialLedgerEntryType.PDV_SUPPLEMENT: {
          supplementsTotal += amt;
          supplementLines.push({
            id: e.id,
            at: e.createdAt.toISOString(),
            amount: roundMoney(amt),
            justification: ledgerMetaScalar(meta?.justification).slice(0, 2000),
          });
          break;
        }
        case FinancialLedgerEntryType.PDV_WITHDRAWAL: {
          const signed = amt <= 0 ? amt : -Math.abs(amt);
          withdrawalsTotalAbs += Math.abs(signed);
          withdrawalLines.push({
            id: e.id,
            at: e.createdAt.toISOString(),
            amount: roundMoney(Math.abs(signed)),
            justification: ledgerMetaScalar(meta?.justification).slice(0, 2000),
          });
          break;
        }
        default:
          break;
      }
    }

    cashSales = roundMoney(cashSales);
    nonCashSales = roundMoney(nonCashSales);
    supplementsTotal = roundMoney(supplementsTotal);
    withdrawalsTotalAbs = roundMoney(withdrawalsTotalAbs);
    const opening = roundMoney(openingFloat);
    const expectedCash = roundMoney(
      opening + cashSales + supplementsTotal - withdrawalsTotalAbs,
    );
    const saleCount = ledgerRows.filter(
      (r) =>
        r.entryType === FinancialLedgerEntryType.SALE_PAYMENT &&
        Number(r.amount) > 0,
    ).length;

    return {
      openingFloat: opening,
      cashSalesTotal: cashSales,
      nonCashSalesTotal: nonCashSales,
      supplementsTotal,
      withdrawalsTotalAbs,
      expectedCash,
      saleCount,
      byPaymentMethod,
      supplementLines,
      withdrawalLines,
    };
  }

  async listCurrentPdvSessionMovements(user: { role: UserRole }) {
    this.assertFinanceStaff(user.role);
    const session = await this.prisma.pdvCashSession.findFirst({
      where: { status: PdvCashSessionStatus.OPEN },
      select: { id: true },
    });
    if (!session) return { movements: [] as Record<string, unknown>[] };

    const rows = await this.prisma.financialLedgerEntry.findMany({
      where: {
        pdvSessionId: session.id,
        entryType: {
          in: [
            FinancialLedgerEntryType.PDV_SUPPLEMENT,
            FinancialLedgerEntryType.PDV_WITHDRAWAL,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        entryType: true,
        amount: true,
        createdAt: true,
        metadata: true,
      },
    });

    return {
      movements: rows.map((r) => {
        const meta = r.metadata as Record<string, unknown> | null;
        const raw = Number(r.amount);
        const isW = r.entryType === FinancialLedgerEntryType.PDV_WITHDRAWAL;
        const amountAbs = roundMoney(Math.abs(raw || 0));
        return {
          id: r.id,
          side: isW ? 'withdrawal' : 'supplement',
          amount: amountAbs,
          justification: ledgerMetaScalar(meta?.justification),
          createdAt: r.createdAt.toISOString(),
        };
      }),
    };
  }

  async recordPdvSupplement(
    user: { id: string; role: UserRole },
    amount: number,
    justification: string,
  ) {
    this.assertFinanceStaff(user.role);
    const session = await this.prisma.pdvCashSession.findFirst({
      where: { status: PdvCashSessionStatus.OPEN },
      select: { id: true },
    });
    if (!session)
      throw new BadRequestException('Não há turno de caixa aberto.');
    const a = roundMoney(amount);
    if (a <= 0) throw new BadRequestException('Valor de suprimento inválido.');

    return this.prisma.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.PDV_SUPPLEMENT,
        amount: new Prisma.Decimal(a),
        currency: 'AOA',
        userId: user.id,
        pdvSessionId: session.id,
        metadata: {
          justification: justification.trim(),
        },
      },
    });
  }

  async recordPdvWithdrawal(
    user: { id: string; role: UserRole },
    amount: number,
    justification: string,
  ) {
    this.assertFinanceStaff(user.role);
    const session = await this.prisma.pdvCashSession.findFirst({
      where: { status: PdvCashSessionStatus.OPEN },
      select: { id: true },
    });
    if (!session)
      throw new BadRequestException('Não há turno de caixa aberto.');
    const v = roundMoney(amount);
    if (v <= 0) throw new BadRequestException('Valor de saída inválido.');

    return this.prisma.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.PDV_WITHDRAWAL,
        amount: new Prisma.Decimal(-v),
        currency: 'AOA',
        userId: user.id,
        pdvSessionId: session.id,
        metadata: {
          justification: justification.trim(),
        },
      },
    });
  }

  /**
   * Totais do turno aberto:
   * esperado em dinheiro = abertura + vendas PDV_CASH + suprimentos − saídas.
   */
  async getOpenSessionSummary(user: { role: UserRole }) {
    this.assertFinanceStaff(user.role);
    const session = await this.prisma.pdvCashSession.findFirst({
      where: { status: PdvCashSessionStatus.OPEN },
      select: { id: true, openingFloat: true, openedAt: true },
    });
    if (!session) {
      return { summary: null };
    }

    const ledgerRows = await this.prisma.financialLedgerEntry.findMany({
      where: { pdvSessionId: session.id },
      select: {
        id: true,
        entryType: true,
        amount: true,
        createdAt: true,
        metadata: true,
        reference: true,
      },
    });

    const s = this.summarizePdvLedger(Number(session.openingFloat), ledgerRows);

    return {
      summary: {
        sessionId: session.id,
        openedAt: session.openedAt.toISOString(),
        openingFloat: s.openingFloat,
        cashSalesTotal: s.cashSalesTotal,
        nonCashSalesTotal: s.nonCashSalesTotal,
        supplementsTotal: s.supplementsTotal,
        withdrawalsTotalAbs: s.withdrawalsTotalAbs,
        expectedCash: s.expectedCash,
        saleCount: s.saleCount,
        byPaymentMethod: s.byPaymentMethod,
      },
    };
  }

  listClosedPdvSessions(user: { role: UserRole }, take: number) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas administrador pode consultar o histórico de turnos fechados.',
      );
    }
    return this.prisma.pdvCashSession.findMany({
      where: { status: PdvCashSessionStatus.CLOSED },
      orderBy: { closedAt: 'desc' },
      take,
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        openingFloat: true,
        declaredCash: true,
        expectedCash: true,
        cashDifference: true,
        closeNotes: true,
        closingSnapshot: true,
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
  }

  async openPdvSession(
    user: { id: string; role: UserRole },
    openingFloat: number,
  ) {
    this.assertFinanceStaff(user.role);
    const existing = await this.prisma.pdvCashSession.findFirst({
      where: { status: PdvCashSessionStatus.OPEN },
    });
    if (existing) {
      throw new BadRequestException(
        'Já existe um turno de caixa aberto. Feche-o antes de abrir outro.',
      );
    }
    return this.prisma.pdvCashSession.create({
      data: {
        status: PdvCashSessionStatus.OPEN,
        openingFloat: new Prisma.Decimal(roundMoney(openingFloat)),
        openedById: user.id,
      },
      include: {
        openedBy: { select: { id: true, name: true } },
      },
    });
  }

  async closePdvSession(
    user: { id: string; role: UserRole },
    declaredCash: number,
    opts?: {
      closeNotes?: string;
      withdrawalsAtClose?: Array<{ amount: number; justification: string }>;
    },
  ) {
    this.assertFinanceStaff(user.role);
    const declared = roundMoney(declaredCash);
    const closeNotesTrim = opts?.closeNotes?.trim() || '';

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.pdvCashSession.findFirst({
        where: { status: PdvCashSessionStatus.OPEN },
        include: {
          openedBy: { select: { id: true, name: true } },
        },
      });
      if (!session) {
        throw new BadRequestException('Não há turno de caixa aberto.');
      }

      const closerName =
        (
          await tx.user.findUnique({
            where: { id: user.id },
            select: { name: true },
          })
        )?.name ?? '—';

      for (const w of opts?.withdrawalsAtClose ?? []) {
        const v = roundMoney(w.amount);
        if (v <= 0) continue;
        const j = String(w.justification ?? '')
          .trim()
          .slice(0, 2000);
        if (j.length < 3)
          throw new BadRequestException(
            'Todas as saídas devem incluir uma justificação (mín. 3 caracteres).',
          );
        await tx.financialLedgerEntry.create({
          data: {
            entryType: FinancialLedgerEntryType.PDV_WITHDRAWAL,
            amount: new Prisma.Decimal(-v),
            currency: 'AOA',
            userId: user.id,
            pdvSessionId: session.id,
            metadata: { justification: j, recordedAtClose: true },
          },
        });
      }

      const ledgerRows = await tx.financialLedgerEntry.findMany({
        where: { pdvSessionId: session.id },
        select: {
          id: true,
          entryType: true,
          amount: true,
          createdAt: true,
          metadata: true,
          reference: true,
        },
      });

      const s = this.summarizePdvLedger(
        Number(session.openingFloat),
        ledgerRows,
      );
      const expectedCash = s.expectedCash;
      const cashDifference = roundMoney(declared - expectedCash);
      const closedAt = new Date();

      const closingSnapshot = {
        currency: 'AOA',
        sessionId: session.id,
        openedAt: session.openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        operators: {
          openedBy: session.openedBy.name,
          closedBy: closerName,
        },
        totals: {
          openingFloat: s.openingFloat,
          cashSalesTotal: s.cashSalesTotal,
          nonCashSalesTotal: s.nonCashSalesTotal,
          supplementsTotal: s.supplementsTotal,
          withdrawalsTotalAbs: s.withdrawalsTotalAbs,
          expectedCash,
          declaredCash: declared,
          cashDifference,
        },
        supplementLines: s.supplementLines,
        withdrawalLines: s.withdrawalLines,
        byPaymentMethod: s.byPaymentMethod,
        settlementCount: s.saleCount,
        closingNotes: closeNotesTrim.length ? closeNotesTrim : null,
      };

      const updated = await tx.pdvCashSession.update({
        where: { id: session.id },
        data: {
          status: PdvCashSessionStatus.CLOSED,
          closedById: user.id,
          closedAt,
          declaredCash: new Prisma.Decimal(declared),
          expectedCash: new Prisma.Decimal(expectedCash),
          cashDifference: new Prisma.Decimal(cashDifference),
          closeNotes: closeNotesTrim.length ? closeNotesTrim : null,
          closingSnapshot: closingSnapshot as unknown as Prisma.InputJsonValue,
        },
        include: {
          openedBy: { select: { id: true, name: true } },
          closedBy: { select: { id: true, name: true } },
        },
      });

      return { updated, closingReport: closingSnapshot };
    });

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });

    if (admins.length > 0) {
      await this.prisma.notification.createMany({
        data: admins.map((a) => ({
          recipientId: a.id,
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.PENDING,
          title: 'Fecho de caixa · relatório disponível',
          body: `Turno PDV encerrado. Quebra numerário: ${result.closingReport.totals.cashDifference}. Esperado ${result.closingReport.totals.expectedCash}; contado ${result.closingReport.totals.declaredCash}.`,
          metadata: {
            kind: 'PDV_SESSION_CLOSED',
            sessionId: result.closingReport.sessionId,
            cashDifference: result.closingReport.totals.cashDifference,
            expectedCash: result.closingReport.totals.expectedCash,
            declaredCash: result.closingReport.totals.declaredCash,
          },
        })),
      });
    }

    return result;
  }

  async salesSummary(from: Date, to: Date, user: { role: UserRole }) {
    this.assertFinanceStaff(user.role);
    const entries = await this.prisma.financialLedgerEntry.findMany({
      where: {
        entryType: FinancialLedgerEntryType.SALE_PAYMENT,
        createdAt: { gte: from, lte: to },
      },
      select: { amount: true, currency: true, metadata: true },
    });

    let total = 0;
    const byOrigin: Record<string, number> = {};
    const byPaymentMethod: Record<string, number> = {};

    for (const e of entries) {
      const amt = Number(e.amount);
      total += amt;
      const meta = e.metadata as Record<string, unknown> | null;
      const origin = ledgerMetaScalar(meta?.orderOrigin) || 'UNKNOWN';
      const pm = ledgerMetaScalar(meta?.paymentMethod) || 'UNKNOWN';
      byOrigin[origin] = roundMoney((byOrigin[origin] ?? 0) + amt);
      byPaymentMethod[pm] = roundMoney((byPaymentMethod[pm] ?? 0) + amt);
    }

    const balcaoRevenue = byOrigin[OrderOrigin.BALCAO] ?? 0;
    const onlineRevenue = byOrigin[OrderOrigin.ONLINE] ?? 0;
    const positiveSaleCount = entries.filter(
      (entry) => Number(entry.amount) > 0,
    ).length;
    const avgTicket =
      positiveSaleCount > 0 ? roundMoney(total / positiveSaleCount) : 0;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      entryCount: positiveSaleCount,
      totalRevenue: roundMoney(total),
      currency: entries[0]?.currency ?? 'AOA',
      balcaoRevenue: roundMoney(balcaoRevenue),
      onlineRevenue: roundMoney(onlineRevenue),
      avgTicket,
      byOrigin,
      byPaymentMethod,
    };
  }

  async listLedger(
    from: Date,
    to: Date,
    take: number,
    user: { role: UserRole },
    filters?: { paymentMethod?: PaymentMethod; orderOrigin?: OrderOrigin },
  ) {
    this.assertFinanceStaff(user.role);
    const rows = await this.prisma.financialLedgerEntry.findMany({
      where: this.buildLedgerWhere(from, to, filters),
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        entryType: true,
        amount: true,
        currency: true,
        reference: true,
        orderId: true,
        userId: true,
        pdvSessionId: true,
        metadata: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      entryType: r.entryType,
      amount: r.amount.toString(),
      currency: r.currency,
      reference: r.reference,
      orderId: r.orderId,
      userId: r.userId,
      pdvSessionId: r.pdvSessionId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
      motive: this.ledgerMotivoForHuman({
        entryType: r.entryType,
        reference: r.reference,
        metadata: r.metadata,
      }),
    }));
  }

  async buildSalesCsv(from: Date, to: Date, user: { role: UserRole }) {
    this.assertFinanceStaff(user.role);
    const rows = await this.prisma.financialLedgerEntry.findMany({
      where: {
        entryType: FinancialLedgerEntryType.SALE_PAYMENT,
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        reference: true,
        amount: true,
        currency: true,
        orderId: true,
        metadata: true,
      },
    });

    const header = [
      'data_hora',
      'referencia',
      'order_id',
      'valor',
      'moeda',
      'origem',
      'metodo_pagamento',
      'motivo',
    ];
    const dataLines = [header.join(';')];
    for (const r of rows) {
      const meta = r.metadata as Record<string, unknown> | null;
      const motive = this.ledgerMotivoForHuman({
        entryType: FinancialLedgerEntryType.SALE_PAYMENT,
        reference: r.reference,
        metadata: r.metadata,
      }).replaceAll(';', ',');
      dataLines.push(
        [
          r.createdAt.toISOString(),
          r.reference ?? '',
          r.orderId ?? '',
          String(r.amount),
          r.currency,
          ledgerMetaScalar(meta?.orderOrigin),
          ledgerMetaScalar(meta?.paymentMethod),
          motive,
        ].join(';'),
      );
    }
    const branding = await this.settings.getDocumentBranding();
    const prefix = this.settings.buildDocumentCsvHeaderRows(
      branding,
      'Razão de vendas',
    );
    return [...prefix, ...dataLines].join('\n');
  }

  async buildLedgerCsv(
    from: Date,
    to: Date,
    user: { role: UserRole },
    filters?: { paymentMethod?: PaymentMethod; orderOrigin?: OrderOrigin },
  ) {
    this.assertFinanceStaff(user.role);
    const rows = await this.prisma.financialLedgerEntry.findMany({
      where: this.buildLedgerWhere(from, to, filters),
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        entryType: true,
        reference: true,
        amount: true,
        currency: true,
        orderId: true,
        pdvSessionId: true,
        metadata: true,
      },
    });

    const header = [
      'data_hora',
      'tipo',
      'referencia',
      'order_id',
      'turno_pdv_id',
      'valor',
      'moeda',
      'origem',
      'metodo_pagamento',
      'justificativa',
      'motivo',
    ];
    const dataLines = [header.join(';')];
    for (const r of rows) {
      const meta = r.metadata as Record<string, unknown> | null;
      const just = ledgerMetaScalar(meta?.justification);
      const motive = this.ledgerMotivoForHuman({
        entryType: r.entryType,
        reference: r.reference,
        metadata: r.metadata,
      }).replaceAll(';', ',');
      dataLines.push(
        [
          r.createdAt.toISOString(),
          r.entryType,
          r.reference ?? '',
          r.orderId ?? '',
          r.pdvSessionId ?? '',
          String(r.amount),
          r.currency,
          ledgerMetaScalar(meta?.orderOrigin),
          ledgerMetaScalar(meta?.paymentMethod),
          just,
          motive,
        ].join(';'),
      );
    }
    const branding = await this.settings.getDocumentBranding();
    const prefix = this.settings.buildDocumentCsvHeaderRows(
      branding,
      'Razão completo',
    );
    return [...prefix, ...dataLines].join('\n');
  }

  async balcaoRetailMargin(from: Date, to: Date, user: { role: UserRole }) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas administradores podem ver o relatório de margem de retalho ao balcão.',
      );
    }

    const orders = await this.prisma.order.findMany({
      where: {
        orderOrigin: OrderOrigin.BALCAO,
        status: { not: OrderStatus.DRAFT },
        updatedAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        orderNumber: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            metadata: true,
            productionProcess: true,
          },
        },
      },
    });

    const insumoIds = new Set<string>();
    for (const o of orders) {
      for (const it of o.items) {
        if (it.productionProcess !== ProductionProcess.STORE_RETAIL) continue;
        if (!metadataIsStoreRetail(it.metadata)) continue;
        insumoIds.add(it.metadata.insumoId);
      }
    }

    const insumoRows =
      insumoIds.size > 0
        ? await this.prisma.insumo.findMany({
            where: { id: { in: [...insumoIds] } },
            select: { id: true, custoUnit: true },
          })
        : [];

    const custoById = new Map(
      insumoRows.map((i) => [i.id, Number(i.custoUnit)]),
    );

    let revenue = 0;
    let cost = 0;

    for (const o of orders) {
      for (const it of o.items) {
        if (it.productionProcess !== ProductionProcess.STORE_RETAIL) continue;
        if (!metadataIsStoreRetail(it.metadata)) continue;
        const q = it.quantity ?? 0;
        const cu = custoById.get(it.metadata.insumoId) ?? 0;
        revenue += Number(it.unitPrice) * q;
        cost += cu * q;
      }
    }

    revenue = roundMoney(revenue);
    cost = roundMoney(cost);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      revenue,
      cost,
      margin: roundMoney(revenue - cost),
      balcaoOrderCount: orders.length,
      currency: 'AOA',
    };
  }

  private treasuryPaymentBucket(
    method: string,
  ): 'DINHEIRO' | 'TPA' | 'TRANSFERENCIA' | 'OUTROS' {
    switch (method as PaymentMethod) {
      case PaymentMethod.PDV_CASH:
      case PaymentMethod.CASH_ON_SITE:
      case PaymentMethod.DEPOSIT:
        return 'DINHEIRO';
      case PaymentMethod.PDV_DEBIT_CARD:
      case PaymentMethod.PDV_CREDIT_CARD:
        return 'TPA';
      case PaymentMethod.BANK_TRANSFER_SAME:
      case PaymentMethod.BANK_TRANSFER_EXPRESS:
        return 'TRANSFERENCIA';
      default:
        return 'OUTROS';
    }
  }

  private paymentMethodHumanLabelPm(pm: unknown): string {
    const key = typeof pm === 'string' ? pm : '';
    const map: Partial<Record<PaymentMethod, string>> = {
      [PaymentMethod.BANK_TRANSFER_SAME]: 'Transferência mesmo banco',
      [PaymentMethod.DEPOSIT]: 'Depósito',
      [PaymentMethod.BANK_TRANSFER_EXPRESS]: 'Transferência express',
      [PaymentMethod.CASH_ON_SITE]: 'Pagamento com dinheiro físico no local',
      [PaymentMethod.PDV_CASH]: 'Dinheiro (balcão)',
      [PaymentMethod.PDV_DEBIT_CARD]: 'Cartão de débito (balcão)',
      [PaymentMethod.PDV_CREDIT_CARD]: 'Cartão de crédito (balcão)',
    };
    if (map[key as PaymentMethod]) return map[key as PaymentMethod]!;
    return key ? key.replaceAll('_', ' ') : 'Meio não indicado';
  }

  private orderOriginHumanLabel(origin: unknown): string {
    const s = ledgerMetaScalar(origin)
      .trim()
      .toUpperCase()
      .replaceAll('-', '_');
    if (s === 'BALCAO') return 'Balcão / PDV';
    if (s === 'ONLINE') return 'Online';
    return (s.replaceAll('_', ' ') || 'Origem não indicada').trim();
  }

  ledgerMotivoForHuman(entry: {
    entryType: FinancialLedgerEntryType;
    reference: string | null;
    metadata: unknown;
  }): string {
    const meta = entry.metadata as Record<string, unknown> | null;
    switch (entry.entryType) {
      case FinancialLedgerEntryType.SALE_PAYMENT: {
        const pedido = entry.reference?.trim() || '—';
        const origin = this.orderOriginHumanLabel(meta?.orderOrigin);
        const pm = this.paymentMethodHumanLabelPm(meta?.paymentMethod);
        const operation = ledgerMetaScalar(meta?.operation);
        if (operation === 'ORDER_CANCELLATION_REVERSAL') {
          const reason = ledgerMetaScalar(meta?.cancellationReason).trim();
          return `Estorno · Pedido ${pedido}${reason ? ` · ${reason}` : ''}`;
        }
        if (operation === 'ORDER_REOPEN_REACTIVATION') {
          return `Reactivação após reabertura · Pedido ${pedido}`;
        }
        return `${origin} · ${pm} · Pedido ${pedido}`;
      }
      case FinancialLedgerEntryType.PDV_SUPPLEMENT: {
        const j = ledgerMetaScalar(meta?.justification).trim();
        return j.length >= 3 ? j : '(Motivo de suprimento não guardado)';
      }
      case FinancialLedgerEntryType.PDV_WITHDRAWAL: {
        const j = ledgerMetaScalar(meta?.justification).trim();
        return j.length >= 3 ? j : '(Motivo de saída não guardado)';
      }
      case FinancialLedgerEntryType.CASH_RECEIPT_OTHER: {
        const cat = ledgerMetaScalar(meta?.category).trim();
        const descr = ledgerMetaScalar(meta?.description).trim();
        const refTrim = entry.reference?.trim();
        let s = cat || 'Recebimento';
        if (descr.length >= 1) {
          s = `${s} · ${descr}`;
        }
        if (refTrim) {
          s = `${s} · Ref.: ${refTrim}`;
        }
        return s;
      }
      case FinancialLedgerEntryType.CASH_EXPENSE: {
        const cat = ledgerMetaScalar(meta?.category).trim();
        const descr = ledgerMetaScalar(meta?.description).trim();
        const base = cat || 'Despesa';
        return descr.length >= 1 ? `${base} · ${descr}` : base;
      }
      default:
        return 'Linha razão · detalhe não mapeado';
    }
  }

  private ledgerClassificationCashFlowPt(
    entryType: FinancialLedgerEntryType,
  ): string {
    switch (entryType) {
      case FinancialLedgerEntryType.SALE_PAYMENT:
        return 'Pagamento de venda';
      case FinancialLedgerEntryType.PDV_SUPPLEMENT:
        return 'Suprimento cofre (PDV)';
      case FinancialLedgerEntryType.PDV_WITHDRAWAL:
        return 'Saída numerário (PDV)';
      case FinancialLedgerEntryType.CASH_RECEIPT_OTHER:
        return 'Outro recebimento';
      case FinancialLedgerEntryType.CASH_EXPENSE:
        return 'Despesa';
      default:
        return String(entryType);
    }
  }

  private cashFlowLedgerMovementRow(e: {
    id: string;
    entryType: FinancialLedgerEntryType;
    amount: Prisma.Decimal;
    reference: string | null;
    metadata: unknown;
    createdAt: Date;
  }): {
    id: string;
    occurredAt: string;
    classification: string;
    direction: 'IN' | 'OUT';
    amount: number;
    motive: string;
  } {
    const rawAbs = roundMoney(Math.abs(Number(e.amount)));
    let direction: 'IN' | 'OUT';

    switch (e.entryType) {
      case FinancialLedgerEntryType.SALE_PAYMENT:
        direction = Number(e.amount) >= 0 ? 'IN' : 'OUT';
        break;
      case FinancialLedgerEntryType.PDV_SUPPLEMENT:
      case FinancialLedgerEntryType.CASH_RECEIPT_OTHER:
        direction = 'IN';
        break;
      case FinancialLedgerEntryType.PDV_WITHDRAWAL:
      case FinancialLedgerEntryType.CASH_EXPENSE:
        direction = 'OUT';
        break;
      default:
        direction = Number(e.amount) >= 0 ? ('IN' as const) : ('OUT' as const);
        break;
    }

    return {
      id: e.id,
      occurredAt: e.createdAt.toISOString(),
      classification: this.ledgerClassificationCashFlowPt(e.entryType),
      direction,
      amount: rawAbs,
      motive: this.ledgerMotivoForHuman({
        entryType: e.entryType,
        reference: e.reference,
        metadata: e.metadata,
      }),
    };
  }

  private dayKeyUtcFromDate(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }

  private monthKeyUtcFromDate(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${mo}`;
  }

  private parseInclusiveDateRange(
    fromStr: string,
    toStr: string,
  ): { from: Date; to: Date } {
    const from = new Date(`${fromStr.slice(0, 10)}T00:00:00`);
    const to = new Date(`${toStr.slice(0, 10)}T23:59:59.999`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Datas inválidas.');
    }
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'A data inicial não pode ser posterior à final.',
      );
    }
    return { from, to };
  }

  private dateAtNoonLocalFromYMD(ymd: string): Date {
    const trimmed = ymd.slice(0, 10);
    const parts = trimmed.split('-').map((x) => Number(x));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
      throw new BadRequestException('Data inválida.');
    }
    const [y, m, day] = parts as [number, number, number];
    return new Date(y, m - 1, day, 12, 0, 0, 0);
  }

  private enumerateGrainKeys(
    grain: 'daily' | 'monthly' | 'yearly',
    from: Date,
    to: Date,
  ): string[] {
    if (grain === 'daily') {
      const keys: string[] = [];
      const cursor = new Date(
        from.getFullYear(),
        from.getMonth(),
        from.getDate(),
      );
      cursor.setHours(0, 0, 0, 0);
      const endMarker = new Date(to.getFullYear(), to.getMonth(), to.getDate());
      endMarker.setHours(0, 0, 0, 0);
      while (cursor.getTime() <= endMarker.getTime()) {
        keys.push(this.dayKeyUtcFromDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return keys.length ? keys : [this.dayKeyUtcFromDate(from)];
    }
    if (grain === 'yearly') {
      const y0 = from.getFullYear();
      const y1 = to.getFullYear();
      const keys: string[] = [];
      for (let y = y0; y <= y1; y++) keys.push(String(y));
      return keys.length ? keys : [String(y0)];
    }
    const keys: string[] = [];
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const last = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur.getTime() <= last.getTime()) {
      keys.push(this.monthKeyUtcFromDate(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return keys.length ? keys : [this.monthKeyUtcFromDate(from)];
  }

  private rowGrainKey(dt: Date, grain: 'daily' | 'monthly' | 'yearly'): string {
    if (grain === 'daily') return this.dayKeyUtcFromDate(dt);
    if (grain === 'yearly') return String(dt.getFullYear());
    return this.monthKeyUtcFromDate(dt);
  }

  async upsertTreasuryOpeningBalance(
    user: { role: UserRole },
    snapshotDateISO: string,
    amount: number,
    notes?: string,
  ) {
    this.assertFinanceAdmin(user.role);
    const snap = roundMoney(amount);
    if (!(snap >= 0) || !Number.isFinite(snap)) {
      throw new BadRequestException('Saldo inicial inválido.');
    }
    const snapshotDate = this.dateAtNoonLocalFromYMD(
      snapshotDateISO.slice(0, 10),
    );
    return this.prisma.treasuryOpeningBalance.upsert({
      where: { snapshotDate },
      create: {
        snapshotDate,
        amount: new Prisma.Decimal(snap),
        currency: 'AOA',
        notes: notes?.trim()?.slice(0, 2000) ?? undefined,
      },
      update: {
        amount: new Prisma.Decimal(snap),
        notes: notes?.trim()?.slice(0, 2000) ?? undefined,
      },
    });
  }

  async getTreasuryOpeningBalance(
    user: { role: UserRole },
    snapshotDateISO: string,
  ) {
    this.assertFinanceAdmin(user.role);
    const snapshotDate = this.dateAtNoonLocalFromYMD(
      snapshotDateISO.slice(0, 10),
    );
    const row = await this.prisma.treasuryOpeningBalance.findUnique({
      where: { snapshotDate },
      select: {
        snapshotDate: true,
        amount: true,
        currency: true,
        notes: true,
        updatedAt: true,
      },
    });
    return row
      ? {
          snapshotDate: row.snapshotDate.toISOString().slice(0, 10),
          amount: roundMoney(Number(row.amount)),
          currency: row.currency,
          notes: row.notes ?? null,
          updatedAt: row.updatedAt.toISOString(),
        }
      : null;
  }

  async recordCashReceiptOther(
    user: { id: string; role: UserRole },
    amount: number,
    category: string,
    description: string,
    reference?: string,
  ) {
    this.assertFinanceAdmin(user.role);
    const a = roundMoney(amount);
    if (!(a >= 0.01)) throw new BadRequestException('Valor inválido.');
    const cat = category.trim();
    if (cat.length < 2)
      throw new BadRequestException(
        'Indique uma categoria (mín. 2 caracteres).',
      );
    const descr = description.trim().slice(0, 2000);
    if (descr.length < 3) {
      throw new BadRequestException(
        'Indique o motivo da entrada (mín. 3 caracteres).',
      );
    }

    await this.prisma.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.CASH_RECEIPT_OTHER,
        amount: new Prisma.Decimal(a),
        currency: 'AOA',
        userId: user.id,
        reference: reference?.trim()?.slice(0, 64) ?? null,
        metadata: {
          category: cat.slice(0, 160),
          description: descr,
        },
      },
    });
    return { ok: true as const };
  }

  private static readonly RH_SALARY_CATEGORY = 'RH / Salários';

  /**
   * Regista saída de tesouraria quando um pagamento de salário/adiantamento é feito no RH.
   * Idempotente por `rhPaymentId` em metadata.
   */
  async recordRhSalaryExpense(
    user: { id: string; role: UserRole },
    params: {
      rhPaymentId: string;
      rhUserId: string;
      colaboradorNome: string;
      periodKey: string;
      tipo: 'salario' | 'adiantamento';
      valorAoa: number;
      referencia?: string;
      notas?: string;
    },
  ): Promise<{ ledgerEntryId: string }> {
    this.assertFinanceAdmin(user.role);

    const existing = await this.prisma.financialLedgerEntry.findFirst({
      where: {
        entryType: FinancialLedgerEntryType.CASH_EXPENSE,
        metadata: { path: ['rhPaymentId'], equals: params.rhPaymentId },
      },
      select: { id: true },
    });
    if (existing) {
      return { ledgerEntryId: existing.id };
    }

    const a = roundMoney(params.valorAoa);
    if (!(a >= 0.01)) throw new BadRequestException('Valor inválido.');

    const tipoLabel =
      params.tipo === 'adiantamento' ? 'Adiantamento' : 'Salário';
    const descrParts = [
      `${tipoLabel} · ${params.colaboradorNome.trim()}`,
      params.periodKey.trim(),
    ];
    if (params.notas?.trim()) descrParts.push(params.notas.trim());
    const descr = descrParts.join(' · ').slice(0, 2000);
    if (descr.length < 3) {
      throw new BadRequestException('Descrição da saída inválida.');
    }

    const entry = await this.prisma.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.CASH_EXPENSE,
        amount: new Prisma.Decimal(-a),
        currency: 'AOA',
        userId: user.id,
        reference:
          params.referencia?.trim()?.slice(0, 64) ??
          params.rhPaymentId.slice(0, 64),
        metadata: {
          category: FinanceService.RH_SALARY_CATEGORY,
          description: descr,
          source: 'rh_salary_payment',
          rhPaymentId: params.rhPaymentId,
          rhUserId: params.rhUserId,
          periodKey: params.periodKey.trim(),
          tipo: params.tipo,
        },
      },
      select: { id: true },
    });

    return { ledgerEntryId: entry.id };
  }

  /**
   * Estorna a saída financeira ligada a um pagamento RH removido.
   */
  async reverseRhSalaryExpenseForPayment(
    user: { id: string; role: UserRole },
    params: {
      rhPaymentId: string;
      colaboradorNome: string;
      periodKey: string;
      tipo: 'salario' | 'adiantamento';
      valorAoa: number;
      ledgerEntryId?: string;
    },
  ): Promise<void> {
    this.assertFinanceAdmin(user.role);

    const existingReversal = await this.prisma.financialLedgerEntry.findFirst({
      where: {
        entryType: FinancialLedgerEntryType.CASH_RECEIPT_OTHER,
        metadata: {
          path: ['reversalOfRhPaymentId'],
          equals: params.rhPaymentId,
        },
      },
      select: { id: true },
    });
    if (existingReversal) return;

    let originalAmount = roundMoney(params.valorAoa);
    if (params.ledgerEntryId) {
      const linked = await this.prisma.financialLedgerEntry.findUnique({
        where: { id: params.ledgerEntryId },
        select: { amount: true, entryType: true },
      });
      if (
        linked?.entryType === FinancialLedgerEntryType.CASH_EXPENSE &&
        linked.amount
      ) {
        originalAmount = roundMoney(Math.abs(Number(linked.amount)));
      }
    } else {
      const linked = await this.prisma.financialLedgerEntry.findFirst({
        where: {
          entryType: FinancialLedgerEntryType.CASH_EXPENSE,
          metadata: { path: ['rhPaymentId'], equals: params.rhPaymentId },
        },
        select: { amount: true },
      });
      if (linked?.amount) {
        originalAmount = roundMoney(Math.abs(Number(linked.amount)));
      }
    }

    if (!(originalAmount >= 0.01)) return;

    const tipoLabel =
      params.tipo === 'adiantamento' ? 'Adiantamento' : 'Salário';
    const descr =
      `Estorno ${tipoLabel.toLowerCase()} · ${params.colaboradorNome.trim()} · ${params.periodKey.trim()}`.slice(
        0,
        2000,
      );

    await this.prisma.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.CASH_RECEIPT_OTHER,
        amount: new Prisma.Decimal(originalAmount),
        currency: 'AOA',
        userId: user.id,
        reference: params.rhPaymentId.slice(0, 64),
        metadata: {
          category: FinanceService.RH_SALARY_CATEGORY,
          description: descr,
          source: 'rh_salary_payment_reversal',
          reversalOfRhPaymentId: params.rhPaymentId,
          periodKey: params.periodKey.trim(),
          tipo: params.tipo,
        },
      },
    });
  }

  async recordCashExpense(
    user: { id: string; role: UserRole },
    amountPositive: number,
    category: string,
    description: string,
  ) {
    this.assertFinanceAdmin(user.role);
    const a = roundMoney(amountPositive);
    if (!(a >= 0.01)) throw new BadRequestException('Valor inválido.');
    const cat = category.trim();
    if (cat.length < 2)
      throw new BadRequestException(
        'Indique uma categoria (mín. 2 caracteres).',
      );
    const descr = description.trim().slice(0, 2000);
    if (descr.length < 3) {
      throw new BadRequestException(
        'Indique o motivo da saída (mín. 3 caracteres).',
      );
    }

    await this.prisma.financialLedgerEntry.create({
      data: {
        entryType: FinancialLedgerEntryType.CASH_EXPENSE,
        amount: new Prisma.Decimal(-a),
        currency: 'AOA',
        userId: user.id,
        metadata: {
          category: cat.slice(0, 160),
          description: descr,
        },
      },
    });
    return { ok: true as const };
  }

  async createCashFlowProjection(
    user: { id: string; role: UserRole },
    body: {
      expectedDate: string;
      direction: CashFlowProjectionDirection;
      amount: number;
      category: string;
      description: string;
    },
  ) {
    this.assertFinanceAdmin(user.role);
    const amt = roundMoney(body.amount);
    if (!(amt >= 0.01)) throw new BadRequestException('Valor inválido.');
    const cat = body.category.trim();
    if (cat.length < 2)
      throw new BadRequestException(
        'Indique uma categoria (mín. 2 caracteres).',
      );
    const descrRaw = body.description.trim().slice(0, 2000);
    if (descrRaw.length < 3) {
      throw new BadRequestException(
        'Indique o motivo da previsão (mín. 3 caracteres).',
      );
    }
    const expectedDate = this.dateAtNoonLocalFromYMD(
      body.expectedDate.slice(0, 10),
    );

    const row = await this.prisma.cashFlowProjection.create({
      data: {
        expectedDate,
        direction: body.direction,
        amount: new Prisma.Decimal(amt),
        currency: 'AOA',
        category: cat.slice(0, 160),
        description: descrRaw,
        createdById: user.id,
      },
      select: {
        id: true,
        expectedDate: true,
        direction: true,
        amount: true,
        currency: true,
        category: true,
        description: true,
        createdAt: true,
      },
    });
    return {
      ...row,
      expectedDate: row.expectedDate.toISOString().slice(0, 10),
      amount: roundMoney(Number(row.amount)),
    };
  }

  async listCashFlowProjections(
    user: { role: UserRole },
    fromStr: string,
    toStr: string,
  ) {
    this.assertFinanceAdmin(user.role);
    const { from, to } = this.parseInclusiveDateRange(fromStr, toStr);
    const fromDay = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
    );
    const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const rows = await this.prisma.cashFlowProjection.findMany({
      where: { expectedDate: { gte: fromDay, lte: toDay } },
      orderBy: [{ expectedDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        expectedDate: true,
        direction: true,
        amount: true,
        currency: true,
        category: true,
        description: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      expectedDate: r.expectedDate.toISOString().slice(0, 10),
      amount: roundMoney(Number(r.amount)),
    }));
  }

  async deleteCashFlowProjection(user: { role: UserRole }, id: string) {
    this.assertFinanceAdmin(user.role);
    try {
      await this.prisma.cashFlowProjection.delete({ where: { id } });
    } catch {
      throw new BadRequestException('Projeção não encontrada.');
    }
    return { ok: true as const };
  }

  async cashFlowReport(
    user: { role: UserRole },
    fromStr: string,
    toStr: string,
    granularityRaw?: string,
    openingBalanceOverride?: number,
  ) {
    this.assertFinanceAdmin(user.role);
    const granularity: 'daily' | 'monthly' | 'yearly' =
      granularityRaw === 'monthly'
        ? 'monthly'
        : granularityRaw === 'yearly'
          ? 'yearly'
          : 'daily';
    const { from, to } = this.parseInclusiveDateRange(fromStr, toStr);

    let openingBalance: number;
    if (
      typeof openingBalanceOverride === 'number' &&
      Number.isFinite(openingBalanceOverride)
    ) {
      openingBalance = roundMoney(openingBalanceOverride);
    } else {
      const rowSnap = await this.prisma.treasuryOpeningBalance.findUnique({
        where: {
          snapshotDate: this.dateAtNoonLocalFromYMD(fromStr.slice(0, 10)),
        },
        select: { amount: true },
      });
      openingBalance = roundMoney(Number(rowSnap?.amount ?? 0));
    }

    const entries = await this.prisma.financialLedgerEntry.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        entryType: {
          in: [
            FinancialLedgerEntryType.SALE_PAYMENT,
            FinancialLedgerEntryType.PDV_SUPPLEMENT,
            FinancialLedgerEntryType.PDV_WITHDRAWAL,
            FinancialLedgerEntryType.CASH_RECEIPT_OTHER,
            FinancialLedgerEntryType.CASH_EXPENSE,
          ],
        },
      },
      select: {
        id: true,
        entryType: true,
        amount: true,
        createdAt: true,
        metadata: true,
        reference: true,
      },
    });

    const periodKeys = this.enumerateGrainKeys(granularity, from, to);
    const rolls = new Map<string, { receipts: number; payments: number }>();
    for (const key of periodKeys) {
      rolls.set(key, { receipts: 0, payments: 0 });
    }

    let totalReceipts = 0;
    let totalPayments = 0;

    type Bucket = Record<
      'DINHEIRO' | 'TPA' | 'TRANSFERENCIA' | 'OUTROS',
      number
    >;
    const paymentBucketsIn: Bucket = {
      DINHEIRO: 0,
      TPA: 0,
      TRANSFERENCIA: 0,
      OUTROS: 0,
    };

    for (const e of entries) {
      const amt = Number(e.amount);
      const mk = this.rowGrainKey(e.createdAt, granularity);
      if (!rolls.has(mk)) {
        rolls.set(mk, { receipts: 0, payments: 0 });
      }
      const bucket = rolls.get(mk)!;

      switch (e.entryType) {
        case FinancialLedgerEntryType.SALE_PAYMENT: {
          const v = roundMoney(amt);
          totalReceipts = roundMoney(totalReceipts + v);
          bucket.receipts = roundMoney(bucket.receipts + v);

          const meta = e.metadata as Record<string, unknown> | null;
          const pm = ledgerMetaScalar(meta?.paymentMethod) || 'UNKNOWN';
          const bKey = this.treasuryPaymentBucket(pm);
          paymentBucketsIn[bKey] = roundMoney(paymentBucketsIn[bKey] + v);

          break;
        }
        case FinancialLedgerEntryType.PDV_SUPPLEMENT: {
          const v = roundMoney(Math.max(amt, 0));
          totalReceipts = roundMoney(totalReceipts + v);
          bucket.receipts = roundMoney(bucket.receipts + v);
          break;
        }
        case FinancialLedgerEntryType.CASH_RECEIPT_OTHER: {
          const v = roundMoney(Math.max(amt, 0));
          totalReceipts = roundMoney(totalReceipts + v);
          bucket.receipts = roundMoney(bucket.receipts + v);
          break;
        }
        case FinancialLedgerEntryType.PDV_WITHDRAWAL: {
          const vAbs = roundMoney(Math.abs(amt <= 0 ? amt : -amt));
          totalPayments = roundMoney(totalPayments + vAbs);
          bucket.payments = roundMoney(bucket.payments + vAbs);
          break;
        }
        case FinancialLedgerEntryType.CASH_EXPENSE: {
          const vAbs = roundMoney(Math.abs(amt <= 0 ? amt : -amt));
          totalPayments = roundMoney(totalPayments + vAbs);
          bucket.payments = roundMoney(bucket.payments + vAbs);
          break;
        }
        default:
          break;
      }
    }

    const bucketTotal = roundMoney(
      paymentBucketsIn.DINHEIRO +
        paymentBucketsIn.TPA +
        paymentBucketsIn.TRANSFERENCIA +
        paymentBucketsIn.OUTROS,
    );

    type PctBucket = Bucket;
    const paymentBucketsPct: PctBucket = {
      DINHEIRO:
        bucketTotal > 0
          ? roundMoney((paymentBucketsIn.DINHEIRO / bucketTotal) * 100)
          : 0,
      TPA:
        bucketTotal > 0
          ? roundMoney((paymentBucketsIn.TPA / bucketTotal) * 100)
          : 0,
      TRANSFERENCIA:
        bucketTotal > 0
          ? roundMoney((paymentBucketsIn.TRANSFERENCIA / bucketTotal) * 100)
          : 0,
      OUTROS:
        bucketTotal > 0
          ? roundMoney((paymentBucketsIn.OUTROS / bucketTotal) * 100)
          : 0,
    };

    let running = openingBalance;
    const periods = periodKeys.map((key) => {
      const { receipts: r, payments: p } = rolls.get(key) ?? {
        receipts: 0,
        payments: 0,
      };
      const net = roundMoney(r - p);
      running = roundMoney(running + net);
      return {
        periodKey: key,
        receipts: r,
        payments: p,
        net,
        cumulativeClosing: running,
      };
    });

    totalReceipts = roundMoney(totalReceipts);
    totalPayments = roundMoney(totalPayments);
    const netTotal = roundMoney(totalReceipts - totalPayments);
    const closingBalance =
      periods.length > 0
        ? periods[periods.length - 1].cumulativeClosing
        : roundMoney(openingBalance);

    const projectionsRaw = await this.listCashFlowProjections(
      user,
      fromStr,
      toStr,
    );

    let projIn = 0;
    let projOut = 0;
    const projectionsMapped = projectionsRaw.map((px) => {
      if (px.direction === CashFlowProjectionDirection.IN) {
        projIn = roundMoney(projIn + px.amount);
      } else {
        projOut = roundMoney(projOut + px.amount);
      }
      return px;
    });

    const todayNoon = this.dateAtNoonLocalFromYMD(
      new Date().toISOString().slice(0, 10),
    );
    const futureProjectionsNet = projectionsRaw
      .filter((px) => {
        const d = this.dateAtNoonLocalFromYMD(px.expectedDate);
        return d.getTime() > todayNoon.getTime();
      })
      .reduce((acc, px) => {
        const amt =
          px.direction === CashFlowProjectionDirection.IN
            ? px.amount
            : -px.amount;
        return roundMoney(acc + amt);
      }, 0);

    const ledgerMovements = [...entries]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((e) =>
        this.cashFlowLedgerMovementRow({
          id: e.id,
          entryType: e.entryType,
          amount: e.amount,
          reference: e.reference,
          metadata: e.metadata,
          createdAt: e.createdAt,
        }),
      );

    return {
      currency: 'AOA',
      granularity,
      periodFrom: fromStr.slice(0, 10),
      periodTo: toStr.slice(0, 10),
      openingBalance,
      totals: {
        receipts: totalReceipts,
        payments: totalPayments,
        net: netTotal,
      },
      closingBalance,
      paymentBucketsReceiptsAbsolute: paymentBucketsIn,
      paymentBucketsPctOfReceiptMix: paymentBucketsPct,
      salePaymentMixTotal: bucketTotal,
      periods,
      ledgerMovements,
      projections: projectionsMapped,
      projectionsSummaryInRange: {
        expectedIn: roundMoney(projIn),
        expectedOut: roundMoney(projOut),
        netProjectedInRange: roundMoney(projIn - projOut),
      },
      futureProjectionsNetFromToday: futureProjectionsNet,
      noteReceiptMixPct:
        bucketTotal <= 0
          ? 'Sem vendas registadas como linhas de pagamento no período; ' +
            'percentagens referem apenas recebimentos de vendas (razão).'
          : null,
    };
  }
}
