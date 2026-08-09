import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClosePdvSessionDto } from './dto/close-pdv-session.dto';
import {
  CashFlowExpenseDto,
  CashFlowOtherReceiptDto,
} from './dto/cash-flow-manual.dto';
import { CashFlowProjectionUpsertDto } from './dto/cash-flow-projection.dto';
import { CashFlowReportQueryDto } from './dto/cash-flow-report-query.dto';
import { FinanceDateRangeDto } from './dto/finance-date-range.dto';
import { FinanceLedgerQueryDto } from './dto/finance-ledger-query.dto';
import { OpenPdvSessionDto } from './dto/open-pdv-session.dto';
import { PdvHistoryQueryDto } from './dto/pdv-history-query.dto';
import { PdvMovementDto } from './dto/pdv-movement.dto';
import { ProjectionRangeDto } from './dto/projection-range.dto';
import { TreasuryOpeningQueryDto } from './dto/treasury-opening-query.dto';
import { TreasuryOpeningDto } from './dto/treasury-opening.dto';
import { FinanceService } from './finance.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  private user(req: Request) {
    return (req as Request & { user: { id: string; role: UserRole } }).user;
  }

  private parseRange(q: FinanceDateRangeDto) {
    const from = new Date(q.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(q.to);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  /** Turno de caixa aberto (se existir). */
  @Get('pdv-session/current')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  async currentSession(@Req() req: Request) {
    const session = await this.finance.getCurrentPdvSession(this.user(req));
    /** Objecto explícito — Nest/Express pode enviar corpo vazio com `return null`, o que parte `response.json()`. */
    return { session };
  }

  /** Totais do turno aberto (esperado em numerário, vendas por método). */
  @Get('pdv-session/current/summary')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  openSessionSummary(@Req() req: Request) {
    return this.finance.getOpenSessionSummary(this.user(req));
  }

  /** Movimentos de suprimento / saída registados durante o turno aberto (auditoria). */
  @Get('pdv-session/current/movements')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  openSessionMovements(@Req() req: Request) {
    return this.finance.listCurrentPdvSessionMovements(this.user(req));
  }

  /** Regista entrada de numerário durante o turno (suprimento). */
  @Post('pdv-session/movement/supplement')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  recordSupplement(@Req() req: Request, @Body() dto: PdvMovementDto) {
    return this.finance.recordPdvSupplement(
      this.user(req),
      dto.amount,
      dto.justification.trim(),
    );
  }

  /** Regista saída de numerário durante o turno (obrigatório justificar). */
  @Post('pdv-session/movement/withdrawal')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  recordWithdrawal(@Req() req: Request, @Body() dto: PdvMovementDto) {
    return this.finance.recordPdvWithdrawal(
      this.user(req),
      dto.amount,
      dto.justification.trim(),
    );
  }

  /** Últimos turnos fechados (reconciliação) — só administrador. */
  @Get('pdv-session/history')
  @Roles(UserRole.ADMIN)
  pdvHistory(@Req() req: Request, @Query() q: PdvHistoryQueryDto) {
    return this.finance.listClosedPdvSessions(this.user(req), q.take ?? 15);
  }

  @Post('pdv-session/open')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  openSession(@Req() req: Request, @Body() dto: OpenPdvSessionDto) {
    return this.finance.openPdvSession(this.user(req), dto.openingFloat);
  }

  @Post('pdv-session/close')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  closeSession(@Req() req: Request, @Body() dto: ClosePdvSessionDto) {
    return this.finance.closePdvSession(this.user(req), dto.declaredCash, {
      closeNotes: dto.closeNotes,
      withdrawalsAtClose: dto.withdrawalsAtClose,
    });
  }

  /* ─── Fluxo de caixa (tesouraria, só ADMIN) ─── */

  @Put('treasury/opening')
  @Roles(UserRole.ADMIN)
  upsertTreasuryOpeningBalance(
    @Req() req: Request,
    @Body() dto: TreasuryOpeningDto,
  ) {
    return this.finance.upsertTreasuryOpeningBalance(
      this.user(req),
      dto.snapshotDate,
      dto.amount,
      dto.notes,
    );
  }

  @Get('treasury/opening')
  @Roles(UserRole.ADMIN)
  getTreasuryOpeningBalance(
    @Req() req: Request,
    @Query() q: TreasuryOpeningQueryDto,
  ) {
    return this.finance.getTreasuryOpeningBalance(this.user(req), q.date);
  }

  @Post('cash-flow/receipt-other')
  @Roles(UserRole.ADMIN)
  cashFlowReceiptOther(
    @Req() req: Request,
    @Body() dto: CashFlowOtherReceiptDto,
  ) {
    const u = this.user(req);
    return this.finance.recordCashReceiptOther(
      u,
      dto.amount,
      dto.category,
      dto.description,
      dto.reference,
    );
  }

  @Post('cash-flow/expense')
  @Roles(UserRole.ADMIN)
  cashFlowExpense(@Req() req: Request, @Body() dto: CashFlowExpenseDto) {
    const u = this.user(req);
    return this.finance.recordCashExpense(
      u,
      dto.amount,
      dto.category,
      dto.description,
    );
  }

  @Get('cash-flow/report')
  @Roles(UserRole.ADMIN)
  cashFlowReport(@Req() req: Request, @Query() q: CashFlowReportQueryDto) {
    return this.finance.cashFlowReport(
      this.user(req),
      q.from,
      q.to,
      q.granularity,
      q.openingBalanceOverride,
    );
  }

  @Get('cash-flow/projections')
  @Roles(UserRole.ADMIN)
  listCashFlowProjections(@Req() req: Request, @Query() q: ProjectionRangeDto) {
    return this.finance.listCashFlowProjections(this.user(req), q.from, q.to);
  }

  @Post('cash-flow/projection')
  @Roles(UserRole.ADMIN)
  createCashFlowProjection(
    @Req() req: Request,
    @Body() dto: CashFlowProjectionUpsertDto,
  ) {
    return this.finance.createCashFlowProjection(this.user(req), {
      expectedDate: dto.expectedDate,
      direction: dto.direction,
      amount: dto.amount,
      category: dto.category,
      description: dto.description,
    });
  }

  @Delete('cash-flow/projection/:id')
  @Roles(UserRole.ADMIN)
  deleteCashFlowProjection(@Req() req: Request, @Param('id') id: string) {
    return this.finance.deleteCashFlowProjection(this.user(req), id);
  }

  /** Resumo de vendas a partir do razão (após activação do módulo). */
  @Get('sales-summary')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  salesSummary(@Req() req: Request, @Query() q: FinanceDateRangeDto) {
    const { from, to } = this.parseRange(q);
    return this.finance.salesSummary(from, to, this.user(req));
  }

  @Get('ledger')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  ledger(@Req() req: Request, @Query() q: FinanceLedgerQueryDto) {
    const { from, to } = this.parseRange(q);
    const take = q.take ?? 200;
    return this.finance.listLedger(from, to, take, this.user(req), {
      paymentMethod: q.paymentMethod,
      orderOrigin: q.orderOrigin,
    });
  }

  @Get('export/sales.csv')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportSalesCsv(
    @Req() req: Request,
    @Query() q: FinanceDateRangeDto,
    @Res() res: Response,
  ) {
    const { from, to } = this.parseRange(q);
    const csv = await this.finance.buildSalesCsv(from, to, this.user(req));
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="vendas-razao.csv"',
    );
    res.send(`\uFEFF${csv}`);
  }

  @Get('export/ledger.csv')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportLedgerCsv(
    @Req() req: Request,
    @Query() q: FinanceLedgerQueryDto,
    @Res() res: Response,
  ) {
    const { from, to } = this.parseRange(q);
    const csv = await this.finance.buildLedgerCsv(from, to, this.user(req), {
      paymentMethod: q.paymentMethod,
      orderOrigin: q.orderOrigin,
    });
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="razao-completo.csv"',
    );
    res.send(`\uFEFF${csv}`);
  }

  /** Margem aproximada: linhas STORE_RETAIL ao balcão vs custo unitário do insumo. */
  @Get('margin/balcao-retail')
  @Roles(UserRole.ADMIN)
  marginBalcaoRetail(@Req() req: Request, @Query() q: FinanceDateRangeDto) {
    const { from, to } = this.parseRange(q);
    return this.finance.balcaoRetailMargin(from, to, this.user(req));
  }
}
