import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MovimentoTipo, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateConsumoDto,
  CreateInsumoDto,
  CreateMovimentoDto,
  UpdateInsumoDto,
} from './dto/insumos.dto';

@Injectable()
export class InsumosService {
  private readonly CATALOG_KEY = 'insumo_catalog_lists';

  constructor(private readonly prisma: PrismaService) {}

  private defaultCatalogLists(): {
    categorias: string[];
    marcas: string[];
    unidades: string[];
  } {
    return {
      categorias: [
        'TECIDO',
        'TINTA',
        'TRANSFER',
        'VINIL',
        'ETIQUETA',
        'EMBALAGEM',
        'BORDADO',
        'OUTRO',
      ],
      marcas: [],
      unidades: ['un', 'm', 'ml', 'm2', 'kg', 'rolo', 'pct', 'cx'],
    };
  }

  private mergeUniqueLists(...lists: (string[] | undefined)[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const list of lists) {
      if (!list) continue;
      for (const raw of list) {
        const s = raw.trim();
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
      }
    }
    return out.sort((a, b) => a.localeCompare(b, 'pt'));
  }

  private toStringArray(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    return raw.filter((x): x is string => typeof x === 'string');
  }

  async getInsumoCatalogLists() {
    const defs = this.defaultCatalogLists();
    const row = await this.prisma.setting.findUnique({
      where: { key: this.CATALOG_KEY },
    });
    const v = row?.value as Record<string, unknown> | undefined;
    return {
      categorias: this.mergeUniqueLists(
        defs.categorias,
        this.toStringArray(v?.categorias),
      ),
      marcas: this.mergeUniqueLists(defs.marcas, this.toStringArray(v?.marcas)),
      unidades: this.mergeUniqueLists(
        defs.unidades,
        this.toStringArray(v?.unidades),
      ),
    };
  }

  async addInsumoCatalogItem(
    kind: 'categoria' | 'marca' | 'unidade',
    value: string,
  ) {
    const maxLen = kind === 'categoria' ? 64 : kind === 'unidade' ? 32 : 120;
    const normalized = value.trim().slice(0, maxLen);
    if (!normalized) {
      throw new BadRequestException('Indique um valor.');
    }
    const lists = await this.getInsumoCatalogLists();
    const listKey =
      kind === 'categoria'
        ? 'categorias'
        : kind === 'marca'
          ? 'marcas'
          : 'unidades';
    if (
      lists[listKey].some((x) => x.toLowerCase() === normalized.toLowerCase())
    ) {
      return lists;
    }
    const row = await this.prisma.setting.findUnique({
      where: { key: this.CATALOG_KEY },
    });
    const raw = (row?.value as Record<string, string[]>) ?? {};
    const extra = [...(raw[listKey] ?? [])];
    extra.push(normalized);
    const nextVal = { ...raw, [listKey]: extra };
    await this.prisma.setting.upsert({
      where: { key: this.CATALOG_KEY },
      create: { key: this.CATALOG_KEY, value: nextVal },
      update: { value: nextVal },
    });
    return this.getInsumoCatalogLists();
  }

  /* ─── Catálogo ─── */

  async listInsumos(includeInactive = false) {
    return this.prisma.insumo.findMany({
      where: includeInactive ? undefined : { activo: true },
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
      include: {
        consumos: true,
        _count: { select: { movimentos: true } },
      },
    });
  }

  /**
   * Leitura mínima para o PDV (balcão): Admin e Atendente consultam stock para venda.
   * Não expõe relações pesadas de /insumos.
   */
  async listForCounterPdv() {
    return this.prisma.insumo.findMany({
      where: { activo: true },
      orderBy: [{ categoria: 'asc' }, { nome: 'asc' }],
      select: {
        id: true,
        nome: true,
        unidade: true,
        stockActual: true,
        custoUnit: true,
        precoVenda: true,
        activo: true,
      },
    });
  }

  async getInsumo(id: string) {
    const item = await this.prisma.insumo.findUnique({
      where: { id },
      include: {
        consumos: true,
        movimentos: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException('Insumo não encontrado');
    return item;
  }

  async createInsumo(dto: CreateInsumoDto) {
    return this.prisma.insumo.create({
      data: {
        nome: dto.nome,
        categoria: (dto.categoria?.trim() || 'OUTRO').slice(0, 64),
        unidade: (dto.unidade?.trim() || 'un').slice(0, 32),
        custoUnit: dto.custoUnit ?? 0,
        precoVenda:
          dto.precoVenda != null && typeof dto.precoVenda === 'number'
            ? new Prisma.Decimal(dto.precoVenda)
            : null,
        stockActual: dto.stockActual ?? 0,
        stockMinimo: dto.stockMinimo ?? 0,
        fornecedor: dto.fornecedor?.trim()
          ? dto.fornecedor.trim().slice(0, 120)
          : null,
        marca: dto.marca?.trim() ? dto.marca.trim().slice(0, 120) : null,
        notas: dto.notas?.trim() || null,
      },
    });
  }

  async updateInsumo(id: string, dto: UpdateInsumoDto) {
    await this.getInsumo(id);
    return this.prisma.insumo.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined && { nome: dto.nome }),
        ...(dto.categoria !== undefined && {
          categoria: (dto.categoria?.trim() || 'OUTRO').slice(0, 64),
        }),
        ...(dto.unidade !== undefined && {
          unidade: (dto.unidade?.trim() || 'un').slice(0, 32),
        }),
        ...(dto.custoUnit !== undefined && {
          custoUnit: new Prisma.Decimal(dto.custoUnit),
        }),
        ...(dto.precoVenda !== undefined && {
          precoVenda:
            dto.precoVenda === null ? null : new Prisma.Decimal(dto.precoVenda),
        }),
        ...(dto.stockMinimo !== undefined && {
          stockMinimo: new Prisma.Decimal(dto.stockMinimo),
        }),
        ...(dto.fornecedor !== undefined && {
          fornecedor: dto.fornecedor?.trim()
            ? dto.fornecedor.trim().slice(0, 120)
            : null,
        }),
        ...(dto.marca !== undefined && {
          marca: dto.marca?.trim() ? dto.marca.trim().slice(0, 120) : null,
        }),
        ...(dto.notas !== undefined && { notas: dto.notas }),
        ...(dto.activo !== undefined && { activo: dto.activo }),
      },
    });
  }

  async deleteInsumo(id: string) {
    await this.getInsumo(id);
    return this.prisma.insumo.delete({ where: { id } });
  }

  /* ─── Movimentos ─── */

  async listMovimentos(insumoId: string, limit = 100) {
    await this.getInsumo(insumoId);
    return this.prisma.movimentoInsumo.findMany({
      where: { insumoId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
  }

  async addMovimento(
    insumoId: string,
    dto: CreateMovimentoDto,
    userId: string,
    orderId?: string | null,
  ) {
    const insumo = await this.getInsumo(insumoId);

    const delta = new Prisma.Decimal(dto.quantidade);
    const isSaida =
      dto.tipo === MovimentoTipo.SAIDA_MANUAL ||
      dto.tipo === MovimentoTipo.SAIDA_PEDIDO;

    if (isSaida) {
      const newStock = new Prisma.Decimal(insumo.stockActual).minus(delta);
      if (newStock.isNegative()) {
        throw new BadRequestException(
          `Stock insuficiente. Stock actual: ${insumo.stockActual.toString()} ${insumo.unidade}`,
        );
      }
    }

    const [movimento] = await this.prisma.$transaction([
      this.prisma.movimentoInsumo.create({
        data: {
          insumoId,
          tipo: dto.tipo,
          quantidade: delta,
          custoUnit:
            dto.custoUnit != null ? new Prisma.Decimal(dto.custoUnit) : null,
          nota: dto.nota,
          userId,
          ...(orderId ? { orderId } : {}),
        },
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.insumo.update({
        where: { id: insumoId },
        data: {
          stockActual: {
            [isSaida ? 'decrement' : 'increment']: delta.toNumber(),
          },
        },
      }),
    ]);

    return movimento;
  }

  /* ─── Consumos (Nível 2) ─── */

  async listConsumos() {
    return this.prisma.insumoConsumo.findMany({
      include: { insumo: { select: { id: true, nome: true, unidade: true } } },
      orderBy: [{ tipoProduto: 'asc' }, { processo: 'asc' }],
    });
  }

  async createConsumo(dto: CreateConsumoDto) {
    await this.getInsumo(dto.insumoId);
    return this.prisma.insumoConsumo.create({
      data: {
        insumoId: dto.insumoId,
        tipoProduto: dto.tipoProduto ?? null,
        processo: dto.processo ?? null,
        qtdPorUnidade: new Prisma.Decimal(dto.qtdPorUnidade),
      },
      include: { insumo: { select: { id: true, nome: true, unidade: true } } },
    });
  }

  async deleteConsumo(id: string) {
    const item = await this.prisma.insumoConsumo.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Regra de consumo não encontrada');
    return this.prisma.insumoConsumo.delete({ where: { id } });
  }

  /* ─── Desconto automático (chamado pelo OrdersService ao aprovar) ─── */

  async descontarPorPedido(
    orderId: string,
    items: Array<{
      tipoProduto?: string;
      processo?: string;
      quantidade: number;
    }>,
    userId: string,
  ) {
    const allRegras = await this.prisma.insumoConsumo.findMany();

    for (const item of items) {
      const tp = item.tipoProduto ?? null;
      const pr = item.processo != null ? String(item.processo) : null;

      const candidatas = allRegras.filter((r) => {
        if (r.tipoProduto != null && r.tipoProduto !== tp) return false;
        if (r.processo != null && r.processo !== pr) return false;
        return true;
      });

      /* Por insumo, aplica só a regra mais específica (evita duplicar global + específica) */
      const spec = (r: (typeof candidatas)[0]) =>
        (r.tipoProduto != null ? 2 : 0) + (r.processo != null ? 1 : 0);
      const porInsumo = new Map<string, (typeof candidatas)[0]>();
      for (const r of candidatas) {
        const prev = porInsumo.get(r.insumoId);
        if (!prev || spec(r) > spec(prev)) porInsumo.set(r.insumoId, r);
      }

      for (const regra of porInsumo.values()) {
        const qtd = new Prisma.Decimal(regra.qtdPorUnidade).times(
          item.quantidade,
        );
        const insumo = await this.prisma.insumo.findUnique({
          where: { id: regra.insumoId },
        });
        if (!insumo || !insumo.activo) continue;

        const newStock = new Prisma.Decimal(insumo.stockActual).minus(qtd);
        const qtdFinal = newStock.isNegative()
          ? new Prisma.Decimal(insumo.stockActual)
          : qtd;

        if (qtdFinal.lte(0)) continue;

        await this.prisma.$transaction([
          this.prisma.movimentoInsumo.create({
            data: {
              insumoId: regra.insumoId,
              tipo: MovimentoTipo.SAIDA_PEDIDO,
              quantidade: qtdFinal,
              nota: `Auto-desconto (aprovação produção)`,
              orderId,
              userId,
            },
          }),
          this.prisma.insumo.update({
            where: { id: regra.insumoId },
            data: { stockActual: { decrement: qtdFinal.toNumber() } },
          }),
        ]);
      }
    }
  }

  /* ─── Dashboard resumo ─── */

  async getDashboard() {
    const [total, insumosComAlerta, recentes, custoTotalRows] =
      await Promise.all([
        this.prisma.insumo.count({ where: { activo: true } }),
        this.prisma.$queryRaw<
          Array<{
            id: string;
            nome: string;
            stock_actual: string;
            stock_minimo: string;
            unidade: string;
          }>
        >`SELECT id, nome, stock_actual, stock_minimo, unidade
       FROM insumos
       WHERE activo = true AND stock_actual <= stock_minimo`,
        this.prisma.movimentoInsumo.findMany({
          take: 15,
          orderBy: { createdAt: 'desc' },
          include: {
            insumo: { select: { nome: true, unidade: true } },
            user: { select: { name: true } },
            order: { select: { orderNumber: true } },
          },
        }),
        this.prisma.$queryRaw<Array<{ total_cost: string }>>`
      SELECT COALESCE(SUM(stock_actual * custo_unit), 0)::text AS total_cost
      FROM insumos
      WHERE activo = true
    `,
      ]);

    const custoTotalStock =
      custoTotalRows[0]?.total_cost != null
        ? String(custoTotalRows[0].total_cost)
        : '0';

    return { total, alertas: insumosComAlerta, recentes, custoTotalStock };
  }
}
