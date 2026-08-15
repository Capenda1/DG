import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { createHash, randomUUID } from 'crypto';
import {
  ArtVersionStatus,
  AuditAction,
  MovimentoTipo,
  OrderOrigin,
  OrderStatus,
  PaymentMethod,
  Prisma,
  ProductStatus,
  ProductionProcess,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { InsumosService } from '../insumos/insumos.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import type {
  CreateCounterOrderDto,
  QuickBalcaoClientDto,
} from './dto/create-counter-order.dto';
import type { ReplaceCounterOrderItemsDto } from './dto/replace-counter-order-items.dto';
import type {
  CreateOrderDto,
  CreateOrderLineDto,
} from './dto/create-order.dto';
import type { SaveCompositionDto } from './dto/save-composition.dto';
import { parseAndValidateModelagemSpecs } from './modelagem-specs.validation';

/** Ficheiro em memória (multer memoryStorage). */
export type MemoryUploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly insumos: InsumosService,
    private readonly finance: FinanceService,
    private readonly notifications: NotificationsService,
  ) {}

  private readonly modelagemAllowedMime = new Set([
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'application/pdf',
  ]);

  private modelagemOrderDir(orderId: string): string {
    const base = this.config.get<string>('uploadDir') ?? 'uploads';
    return join(process.cwd(), base, 'orders', orderId, 'modelagem');
  }

  private modelagemArtDir(orderId: string): string {
    const base = this.config.get<string>('uploadDir') ?? 'uploads';
    return join(process.cwd(), base, 'orders', orderId, 'art');
  }

  /**
   * Cliente: alterações ao editor só com pedido em rascunho (rastreabilidade /
   * produção). Staff não passa por aqui nos fluxos cliente.
   */
  private assertClientModelagemDraftOnly(status: OrderStatus): void {
    if (status !== OrderStatus.DRAFT) {
      throw new ForbiddenException(
        'O design só pode ser alterado enquanto o pedido está em rascunho.',
      );
    }
  }

  private extForMime(mime: string): string {
    if (mime === 'image/png') return '.png';
    if (mime === 'image/jpeg') return '.jpg';
    if (mime === 'image/svg+xml') return '.svg';
    if (mime === 'application/pdf') return '.pdf';
    return '.bin';
  }

  /**
   * Pedidos de balcão são geridos pela operação; o cliente associado não os altera pela API.
   */
  private assertClientCannotMutateBalcaoOrder(
    order: { orderOrigin: OrderOrigin; clientId: string },
    actor: { id: string; role: UserRole },
  ): void {
    if (
      actor.role === UserRole.CLIENT &&
      order.clientId === actor.id &&
      order.orderOrigin === OrderOrigin.BALCAO
    ) {
      throw new ForbiddenException(
        'Pedidos registados no balcão só podem ser alterados pela equipa interna.',
      );
    }
  }

  /** Valor / notas definidos no fluxo online não podem ser sobrescritos pela operação. */
  private assertOnlineOrderNotStaffPriced(orderOrigin: OrderOrigin): void {
    if (orderOrigin === OrderOrigin.ONLINE) {
      throw new ForbiddenException(
        'Pedidos criados online pelo cliente não podem ter o valor ou notas alterados pela operação.',
      );
    }
  }

  private assertAdminCannotDeleteOnlineOrder(
    orderOrigin: OrderOrigin,
    actorRole: UserRole,
  ): void {
    if (actorRole === UserRole.ADMIN && orderOrigin === OrderOrigin.ONLINE) {
      throw new ForbiddenException(
        'Pedidos criados online pelo cliente não podem ser eliminados pela administração.',
      );
    }
  }

  /** Submeter rascunho (→SUBMITTED) só via `submitOrderWithProof` / POST :id/submit — não pelo PATCH de estado. */
  private readonly transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
    [OrderStatus.DRAFT]: [OrderStatus.CANCELLED],
    [OrderStatus.SUBMITTED]: [
      OrderStatus.VALIDATION_PAYMENT,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.VALIDATION_PAYMENT]: [
      OrderStatus.APPROVED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.APPROVED]: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
    [OrderStatus.IN_PRODUCTION]: [OrderStatus.FINISHED, OrderStatus.CANCELLED],
    [OrderStatus.FINISHED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    /** Admin pode anular uma venda de balcão já entregue; clientes continuam bloqueados. */
    [OrderStatus.DELIVERED]: [OrderStatus.CANCELLED],
    [OrderStatus.CANCELLED]: [],
  };

  /** Sem `designerId`: visível a todos designers nestes estados (fila creativa típica). */
  private readonly designerUnassignedVisibleStatuses: OrderStatus[] = [
    OrderStatus.SUBMITTED,
    OrderStatus.VALIDATION_PAYMENT,
  ];

  /** Rascunho de balcão (DRAFT) visível à equipa de design após acção no PDV. */
  private readonly designerVisibleBalcaoDraftClause = {
    designerId: null,
    status: OrderStatus.DRAFT,
    orderOrigin: OrderOrigin.BALCAO,
    draftSharedWithDesignTeam: true,
  } as const;

  /** Transferência / depósito: o cliente deve anexar comprovativo no submit (PNG/JPEG/PDF). */
  private paymentMethodRequiresProof(
    pm: PaymentMethod | null | undefined,
  ): boolean {
    if (!pm) return false;
    return (
      pm === PaymentMethod.BANK_TRANSFER_SAME ||
      pm === PaymentMethod.DEPOSIT ||
      pm === PaymentMethod.BANK_TRANSFER_EXPRESS
    );
  }

  /**
   * Quem pode aplicar cada transição (além de ADMIN, que vê sempre o grafo completo).
   * - Cliente: apenas cancelamento do próprio pedido (mantido na lógica de `CANCELLED`).
   * - Atendente: colocar em «Validação e pagamento»; marcar como «Entregue».
   * - Designer (pedido atribuído): «Aprovado» → «Em produção» → «Finalizado».
   * - Última fase «Entregue» (FINISHED → DELIVERED): qualquer perfil interno (ADMIN, ATENDANT, DESIGNER).
   */
  private canTransitionByRole(
    role: UserRole,
    current: OrderStatus,
    next: OrderStatus,
    transitionContext?: {
      orderOrigin: OrderOrigin;
      items: { productionProcess: ProductionProcess }[];
    },
  ): boolean {
    if (role === UserRole.ADMIN) {
      return true;
    }

    if (next === OrderStatus.CANCELLED) {
      if (role === UserRole.CLIENT) {
        return (
          current !== OrderStatus.DELIVERED && current !== OrderStatus.CANCELLED
        );
      }
      return false;
    }

    if (role === UserRole.CLIENT) {
      return false;
    }

    if (role === UserRole.ATTENDANT) {
      if (
        transitionContext &&
        this.isBalcaoOnlyStoreRetail(transitionContext) &&
        next === OrderStatus.DELIVERED &&
        current !== OrderStatus.DELIVERED &&
        current !== OrderStatus.CANCELLED &&
        current !== OrderStatus.DRAFT
      ) {
        return true;
      }
      return (
        (current === OrderStatus.SUBMITTED &&
          next === OrderStatus.VALIDATION_PAYMENT) ||
        (current === OrderStatus.FINISHED && next === OrderStatus.DELIVERED)
      );
    }

    if (role === UserRole.DESIGNER) {
      if (current === OrderStatus.FINISHED && next === OrderStatus.DELIVERED) {
        return true;
      }
      return (
        (current === OrderStatus.VALIDATION_PAYMENT &&
          next === OrderStatus.APPROVED) ||
        (current === OrderStatus.APPROVED &&
          next === OrderStatus.IN_PRODUCTION) ||
        (current === OrderStatus.IN_PRODUCTION && next === OrderStatus.FINISHED)
      );
    }

    return false;
  }

  private async allocateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DG-${year}-`;
    const last = await this.prisma.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    let next = 1;
    if (last?.orderNumber) {
      const suffix = last.orderNumber.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (Number.isFinite(n)) {
        next = n + 1;
      }
    }
    return `${prefix}${String(next).padStart(5, '0')}`;
  }

  private orderDetailInclude() {
    return {
      client: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          clientType: true,
          nif: true,
        },
      },
      designer: { select: { id: true, email: true, name: true } },
      attendant: { select: { id: true, email: true, name: true } },
      deliveredBy: { select: { id: true, email: true, name: true } },
      cancelledBy: { select: { id: true, email: true, name: true } },
      items: { orderBy: { id: 'asc' as const } },
      _count: { select: { items: true, artVersions: true } },
      /** Versões recentes da modelagem (para reabrir o editor mesmo se a última gravação veio só com PNG). */
      artVersions: {
        orderBy: { versionIndex: 'desc' as const },
        take: 8,
        select: {
          versionIndex: true,
          layersJson: true,
          storageKey: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
      },
    };
  }

  /** Arte PNG e anexos de modelagem: atendente só nos pedidos de balcão que iniciou. */
  private async assertAttendantOwnCounterOrderForArtAccess(
    orderId: string,
    user: { id: string; role: UserRole },
  ): Promise<void> {
    if (user.role !== UserRole.ATTENDANT) return;
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { attendantId: true },
    });
    if (!row?.attendantId || row.attendantId !== user.id) {
      throw new ForbiddenException(
        'Só podes visualizar arte e ficheiros de modelagem dos pedidos de balcão que iniciaste.',
      );
    }
  }

  private isBalcaoOnlyStoreRetail(order: {
    orderOrigin: OrderOrigin;
    items: { productionProcess: ProductionProcess }[];
  }): boolean {
    return (
      order.orderOrigin === OrderOrigin.BALCAO &&
      order.items.length > 0 &&
      order.items.every(
        (i) => i.productionProcess === ProductionProcess.STORE_RETAIL,
      )
    );
  }

  private isAreaPricedLine(
    product: { code: string; familyConfig: unknown },
    variantMeta: Record<string, unknown>,
  ): boolean {
    if (variantMeta.pricingKind === 'AREA') return true;
    const fc = product.familyConfig;
    if (fc != null && typeof fc === 'object' && !Array.isArray(fc)) {
      const pk = (fc as Record<string, unknown>).pricingKind;
      if (pk === 'AREA') return true;
    }
    const code = product.code.trim().toUpperCase();
    return code === 'LONA' || code === 'VINIL';
  }

  private metadataIsStoreRetail(metadata: unknown): metadata is {
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

  private async buildOrderItemsFromLines(
    items: CreateOrderLineDto[],
    options?: { allowInsumoLines?: boolean },
  ): Promise<{
    lineData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[];
    orderCurrency: string | null;
  }> {
    const lineData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
    let orderCurrency: string | null = null;

    for (const i of items) {
      const insumoRequested = Boolean(String(i.insumoId ?? '').trim());
      if (i.productVariantId && insumoRequested) {
        throw new BadRequestException(
          'Em cada linha use apenas uma origem: variante de produto OU insumo ao balcão.',
        );
      }

      if (i.productVariantId) {
        const v = await this.prisma.productVariant.findFirst({
          where: {
            id: i.productVariantId,
            active: true,
            product: { status: ProductStatus.ACTIVE },
          },
          include: { product: true },
        });
        if (!v) {
          throw new BadRequestException(
            'Variante de produto inválida, inactiva ou indisponível.',
          );
        }
        if (!v.productionProcess) {
          throw new BadRequestException(
            `A variante ${v.sku} não tem processo de produção configurado. Contacte o suporte.`,
          );
        }
        const variantMeta =
          v.metadata != null &&
          typeof v.metadata === 'object' &&
          !Array.isArray(v.metadata)
            ? (v.metadata as Record<string, unknown>)
            : {};
        const areaPriced = this.isAreaPricedLine(v.product, variantMeta);
        let unitPrice = v.unitPrice;
        let productName: string;
        const sizePart = v.size?.trim() || 'Único';

        if (areaPriced) {
          const widthM = i.widthM;
          const heightM = i.heightM;
          if (
            widthM == null ||
            heightM == null ||
            !Number.isFinite(widthM) ||
            !Number.isFinite(heightM) ||
            widthM <= 0 ||
            heightM <= 0
          ) {
            throw new BadRequestException(
              `«${v.product.name}»: indica altura e largura em metros (Lona/Vinil).`,
            );
          }
          const pricePerM2 = Number(v.unitPrice);
          if (!Number.isFinite(pricePerM2) || pricePerM2 < 0) {
            throw new BadRequestException(
              `Variante ${v.sku} sem preço por m² válido.`,
            );
          }
          const pieceTotal = widthM * heightM * pricePerM2;
          unitPrice = new Prisma.Decimal(pieceTotal);
          productName = `${v.product.name} — ${widthM}×${heightM} m · ${sizePart}`;
        } else {
          const colorPart = v.baseColor?.trim() || 'Cor';
          productName = `${v.product.name} — ${colorPart} / ${sizePart}`;
        }

        const metadata: Prisma.InputJsonValue = {
          garmentType: v.garmentType,
          baseColor: v.baseColor,
          size: v.size,
          sku: v.sku,
          productCode: v.product.code,
          productId: v.product.id,
          catalogFamily: v.product.catalogFamily,
          ...variantMeta,
          ...(areaPriced && i.widthM != null && i.heightM != null
            ? {
                pricingKind: 'AREA',
                widthM: i.widthM,
                heightM: i.heightM,
                area: i.widthM * i.heightM,
                pricePerM2: Number(v.unitPrice),
                areaUnit: 'M',
              }
            : {}),
        };
        lineData.push({
          productVariantId: v.id,
          skuCode: v.sku,
          productName,
          quantity: i.quantity,
          unitPrice,
          productionProcess: v.productionProcess,
          metadata,
        });
        if (orderCurrency == null) {
          orderCurrency = v.currency.slice(0, 3);
        }
      } else if (insumoRequested) {
        if (!options?.allowInsumoLines) {
          throw new BadRequestException(
            'Linhas de insumo ao balcão não são permitidas neste tipo de pedido.',
          );
        }
        const id = String(i.insumoId!).trim();
        const ins = await this.prisma.insumo.findFirst({
          where: { id, activo: true },
          select: {
            id: true,
            nome: true,
            unidade: true,
          },
        });
        if (!ins) {
          throw new BadRequestException(
            'Insumo inválido, inactivo ou indisponível para venda ao balcão.',
          );
        }
        if (i.unitPrice === undefined || i.unitPrice === null) {
          throw new BadRequestException(
            'Em linhas de insumo ao balcão é obrigatório indicar unitPrice.',
          );
        }
        const q = Math.round(i.quantity);
        if (!Number.isFinite(q) || q < 1 || q !== i.quantity) {
          throw new BadRequestException(
            'A quantidade em linhas de insumo deve ser um número inteiro ≥ 1.',
          );
        }
        const productName = ins.nome.trim() || 'Insumo';
        const metadata: Prisma.InputJsonValue = {
          lineType: 'STORE_RETAIL',
          insumoId: ins.id,
          unidade: ins.unidade,
        };
        lineData.push({
          productName,
          quantity: q,
          unitPrice: new Prisma.Decimal(i.unitPrice),
          productionProcess: ProductionProcess.STORE_RETAIL,
          metadata,
        });
      } else {
        const name = i.productName?.trim();
        if (
          !name ||
          i.unitPrice === undefined ||
          i.productionProcess === undefined
        ) {
          throw new BadRequestException(
            'Em linhas sem variante, productName, unitPrice e productionProcess são obrigatórios.',
          );
        }
        lineData.push({
          productName: name,
          quantity: i.quantity,
          unitPrice: new Prisma.Decimal(i.unitPrice),
          productionProcess: i.productionProcess,
        });
      }
    }

    return { lineData, orderCurrency };
  }

  searchClientsForCounter(q: string) {
    return this.users.findClientsForCounterSearch(q);
  }

  /**
   * Cria cliente na base (mesma lógica que `quickClient` no pedido de balcão),
   * para o registo rápido gravar antes do rascunho e aparecer na pesquisa.
   */
  async registerCounterQuickClient(
    dto: QuickBalcaoClientDto,
    actor: { id: string; role: UserRole },
  ) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.ATTENDANT) {
      throw new ForbiddenException(
        'Sem permissão para registar clientes no balcão.',
      );
    }
    const name = dto.name.trim();
    if (name.length < 2) {
      throw new BadRequestException('Nome do cliente inválido.');
    }
    const row = await this.users.createBalcaoClient({
      name,
      phone: dto.phone?.trim() ? dto.phone.trim() : null,
      isCompany: dto.isCompany === true,
      nif: dto.nif,
    });
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      clientType: row.clientType,
      nif: row.nif,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Insumos activos + stock para linhas de material no PDV (Admin, Atendente). */
  listCounterInsumosCatalog() {
    return this.insumos.listForCounterPdv();
  }

  async createCounterOrder(
    dto: CreateCounterOrderDto,
    actor: { id: string; role: UserRole },
  ) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.ATTENDANT) {
      throw new ForbiddenException(
        'Sem permissão para criar pedidos de balcão.',
      );
    }
    await this.finance.ensureBalcaoCashSessionIsOpen();
    const hasClient = Boolean(dto.clientId?.trim());
    const hasQuick = Boolean(dto.quickClient);
    if (hasClient === hasQuick) {
      throw new BadRequestException(
        'Indica exactamente um: clientId de cliente existente ou quickClient para registo rápido.',
      );
    }

    let clientId: string;
    if (dto.clientId) {
      const u = await this.prisma.user.findFirst({
        where: { id: dto.clientId, role: UserRole.CLIENT, active: true },
        select: { id: true },
      });
      if (!u) {
        throw new BadRequestException(
          'Cliente não encontrado, inválido ou desactivado.',
        );
      }
      clientId = u.id;
    } else {
      const qc = dto.quickClient!;
      const created = await this.users.createBalcaoClient({
        name: qc.name,
        phone: qc.phone,
        isCompany: qc.isCompany === true,
        nif: qc.nif,
      });
      clientId = created.id;
    }

    const { lineData, orderCurrency } = await this.buildOrderItemsFromLines(
      dto.items,
      { allowInsumoLines: true },
    );
    let gross = 0;
    for (const line of lineData) {
      const qty = line.quantity ?? 0;
      gross += Number(line.unitPrice) * qty;
    }
    gross = Math.round(gross * 100) / 100;

    const orderNumber = await this.allocateOrderNumber();
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        clientId,
        status: OrderStatus.DRAFT,
        totalAmount: new Prisma.Decimal(gross),
        discountAmount: new Prisma.Decimal(0),
        currency: orderCurrency ?? 'AOA',
        orderOrigin: OrderOrigin.BALCAO,
        attendantId: actor.id,
        notes: dto.notes?.trim() ? dto.notes.trim() : null,
        items: { create: lineData },
      },
      include: this.orderDetailInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: order.id,
        orderId: order.id,
        action: AuditAction.CREATE,
        userId: actor.id,
        payload: {
          orderNumber,
          lineCount: dto.items.length,
          orderOrigin: 'BALCAO',
          clientId,
          channel: 'counter_draft',
          grossSubtotal: gross,
        },
      },
    });

    return order;
  }

  /**
   * Substitui as linhas de um rascunho de balcão (voltar ao passo 1 e alterar artigos).
   * Mantém o mesmo pedido, cliente e número.
   */
  async replaceCounterOrderItems(
    orderId: string,
    dto: ReplaceCounterOrderItemsDto,
    actor: { id: string; role: UserRole },
  ) {
    return this.replaceDraftOrderItems(orderId, dto, actor, {
      channel: 'BALCAO',
    });
  }

  /**
   * Cliente online: substitui artigos do próprio rascunho ONLINE.
   */
  async replaceClientDraftOrderItems(
    orderId: string,
    dto: ReplaceCounterOrderItemsDto,
    actor: { id: string; role: UserRole },
  ) {
    return this.replaceDraftOrderItems(orderId, dto, actor, {
      channel: 'ONLINE_CLIENT',
    });
  }

  private async replaceDraftOrderItems(
    orderId: string,
    dto: ReplaceCounterOrderItemsDto,
    actor: { id: string; role: UserRole },
    opts: { channel: 'BALCAO' | 'ONLINE_CLIENT' },
  ) {
    const balcao = opts.channel === 'BALCAO';
    if (balcao) {
      if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.ATTENDANT) {
        throw new ForbiddenException(
          'Sem permissão para editar pedidos de balcão.',
        );
      }
      await this.finance.ensureBalcaoCashSessionIsOpen();
    } else if (actor.role !== UserRole.CLIENT) {
      throw new ForbiddenException(
        'Sem permissão para editar este pedido.',
      );
    }

    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        orderOrigin: true,
        attendantId: true,
        clientId: true,
        orderNumber: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (existing.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Só é possível alterar artigos de pedidos em rascunho.',
      );
    }
    if (balcao) {
      if (existing.orderOrigin !== OrderOrigin.BALCAO) {
        throw new BadRequestException(
          'Só pedidos de balcão podem ser editados neste fluxo.',
        );
      }
      if (
        actor.role === UserRole.ATTENDANT &&
        existing.attendantId != null &&
        existing.attendantId !== actor.id
      ) {
        throw new ForbiddenException(
          'Este rascunho pertence a outro atendente.',
        );
      }
    } else {
      if (existing.orderOrigin !== OrderOrigin.ONLINE) {
        throw new BadRequestException(
          'Só pedidos online em rascunho podem ser editados neste fluxo.',
        );
      }
      if (existing.clientId !== actor.id) {
        throw new ForbiddenException(
          'Só podes editar os teus próprios pedidos.',
        );
      }
    }

    const { lineData, orderCurrency } = await this.buildOrderItemsFromLines(
      dto.items,
      { allowInsumoLines: balcao },
    );
    let gross = 0;
    for (const line of lineData) {
      const qty = line.quantity ?? 0;
      gross += Number(line.unitPrice) * qty;
    }
    gross = Math.round(gross * 100) / 100;

    const order = await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId } });
      return tx.order.update({
        where: { id: orderId },
        data: {
          totalAmount: new Prisma.Decimal(gross),
          discountAmount: new Prisma.Decimal(0),
          ...(orderCurrency ? { currency: orderCurrency } : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes.trim() ? dto.notes.trim() : null }
            : {}),
          items: { create: lineData },
        },
        include: this.orderDetailInclude(),
      });
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: order.id,
        orderId: order.id,
        action: AuditAction.UPDATE,
        userId: actor.id,
        payload: {
          orderNumber: existing.orderNumber,
          lineCount: dto.items.length,
          channel:
            opts.channel === 'BALCAO'
              ? 'counter_replace_items'
              : 'client_replace_items',
          grossSubtotal: gross,
        },
      },
    });

    return order;
  }

  async createDraftForClient(
    clientId: string,
    dto: CreateOrderDto,
    actor: { id: string; role: UserRole },
  ) {
    if (actor.role !== UserRole.CLIENT || actor.id !== clientId) {
      throw new ForbiddenException(
        'Apenas clientes podem criar pedidos para a própria conta.',
      );
    }

    const orderNumber = await this.allocateOrderNumber();

    const { lineData, orderCurrency } = await this.buildOrderItemsFromLines(
      dto.items,
    );

    let total = 0;
    for (const line of lineData) {
      const qty = line.quantity ?? 0;
      total += Number(line.unitPrice) * qty;
    }

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        clientId,
        orderOrigin: OrderOrigin.ONLINE,
        status: OrderStatus.DRAFT,
        totalAmount: new Prisma.Decimal(total),
        currency: orderCurrency ?? 'AOA',
        notes: dto.notes?.trim() ? dto.notes.trim() : null,
        items: { create: lineData },
      },
      include: this.orderDetailInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: order.id,
        orderId: order.id,
        action: AuditAction.CREATE,
        userId: clientId,
        payload: { orderNumber, lineCount: dto.items.length },
      },
    });

    return order;
  }

  /**
   * Rascunhos de balcão (DRAFT) por criador: atendente vê só os seus; admin vê todos os de balcão em rascunho.
   */
  listCounterDraftSummaries(actor: { id: string; role: UserRole }) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.ATTENDANT) {
      throw new ForbiddenException(
        'Sem permissão para listar rascunhos de balcão.',
      );
    }

    const where =
      actor.role === UserRole.ATTENDANT
        ? {
            status: OrderStatus.DRAFT,
            orderOrigin: OrderOrigin.BALCAO,
            attendantId: actor.id,
          }
        : {
            status: OrderStatus.DRAFT,
            orderOrigin: OrderOrigin.BALCAO,
          };

    return this.prisma.order.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        updatedAt: true,
        totalAmount: true,
        currency: true,
        draftSharedWithDesignTeam: true,
        client: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Marca o rascunho de balcão como visível à equipa de design (lista + reclamar + modelagem).
   */
  async shareBalcaoDraftWithDesignTeam(
    orderId: string,
    actor: { id: string; role: UserRole },
  ) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.ATTENDANT) {
      throw new ForbiddenException(
        'Apenas administrador ou atendente podem partilhar o rascunho com a equipa de design.',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        orderOrigin: true,
        attendantId: true,
        draftSharedWithDesignTeam: true,
        items: { select: { productionProcess: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Só pedidos em rascunho podem ser partilhados desta forma.',
      );
    }

    if (order.orderOrigin !== OrderOrigin.BALCAO) {
      throw new BadRequestException(
        'A partilha com design destina-se apenas a pedidos criados no balcão.',
      );
    }

    if (actor.role === UserRole.ATTENDANT && order.attendantId !== actor.id) {
      throw new ForbiddenException(
        'Só o atendente que criou este rascunho o pode partilhar com a equipa de design.',
      );
    }

    const needsDesign = order.items.some(
      (i) => i.productionProcess !== ProductionProcess.STORE_RETAIL,
    );
    if (!needsDesign) {
      throw new BadRequestException(
        'Este pedido só inclui retalho de stock; não há modelagem para a equipa de design trabalhar.',
      );
    }

    if (order.draftSharedWithDesignTeam) {
      return this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: this.orderDetailInclude(),
      });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { draftSharedWithDesignTeam: true },
      include: this.orderDetailInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: updated.id,
        orderId: updated.id,
        action: AuditAction.UPDATE,
        userId: actor.id,
        payload: {
          draftSharedWithDesignTeam: true,
          orderNumber: order.orderNumber,
        },
      },
    });

    return updated;
  }

  async findManyForList(
    user: { id: string; role: UserRole },
    take = 50,
    skip = 0,
    opts?: { includeItems?: boolean },
  ) {
    const where =
      user.role === UserRole.CLIENT
        ? { clientId: user.id }
        : user.role === UserRole.DESIGNER
          ? {
              OR: [
                { designerId: user.id },
                {
                  designerId: null,
                  status: { in: this.designerUnassignedVisibleStatuses },
                },
                { ...this.designerVisibleBalcaoDraftClause },
                /** Entrega em equipa: todos os designers vêem «Finalizado» para marcar entregue. */
                { status: OrderStatus.FINISHED },
              ],
            }
          : undefined;

    const safeTake = Math.min(Math.max(take, 1), 200);
    const safeSkip = Math.min(Math.max(skip, 0), 10_000);

    const includeItems =
      Boolean(opts?.includeItems) && user.role !== UserRole.CLIENT;

    const rows = await this.prisma.order.findMany({
      take: safeTake,
      skip: safeSkip,
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          clientType: true,
          nif: true,
        },
      },
        designer: { select: { id: true, email: true, name: true } },
        attendant: { select: { id: true, email: true, name: true } },
        deliveredBy: { select: { id: true, email: true, name: true } },
        cancelledBy: { select: { id: true, email: true, name: true } },
        _count: { select: { items: true, artVersions: true } },
        ...(includeItems
          ? {
              items: {
                select: {
                  productName: true,
                  quantity: true,
                  metadata: true,
                  productionProcess: true,
                },
              },
            }
          : {}),
      },
    });

    if (user.role === UserRole.CLIENT) {
      return rows.map((o) =>
        o.orderOrigin === OrderOrigin.ONLINE ? { ...o, attendant: null } : o,
      );
    }

    return rows;
  }

  /**
   * Designer atribui o pedido a si próprio (fila sem designer).
   */
  async claimOrderAsDesigner(
    orderId: string,
    actor: { id: string; role: UserRole },
  ) {
    if (actor.role !== UserRole.DESIGNER) {
      throw new ForbiddenException(
        'Apenas o perfil designer pode reclamar pedidos desta fila.',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        designerId: true,
        orderOrigin: true,
        draftSharedWithDesignTeam: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (order.designerId != null) {
      if (order.designerId === actor.id) {
        return this.prisma.order.findUniqueOrThrow({
          where: { id: orderId },
          include: {
            client: {
              select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                clientType: true,
                nif: true,
              },
            },
            designer: { select: { id: true, email: true, name: true } },
            attendant: { select: { id: true, email: true, name: true } },
            _count: { select: { items: true, artVersions: true } },
          },
        });
      }
      throw new BadRequestException('Este pedido já tem designer atribuído.');
    }

    const claimableBalcaoDraft =
      order.status === OrderStatus.DRAFT &&
      order.orderOrigin === OrderOrigin.BALCAO &&
      order.draftSharedWithDesignTeam;

    if (
      !this.designerUnassignedVisibleStatuses.includes(order.status) &&
      !claimableBalcaoDraft
    ) {
      throw new BadRequestException(
        'Só é possível reclamar pedidos na fila criativa (submetido ou validação de pagamento) ou rascunhos de balcão partilhados pelo PDV.',
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { designerId: actor.id },
      include: {
        client: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          clientType: true,
          nif: true,
        },
      },
        designer: { select: { id: true, email: true, name: true } },
        attendant: { select: { id: true, email: true, name: true } },
        _count: { select: { items: true, artVersions: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: updated.id,
        orderId: updated.id,
        action: AuditAction.UPDATE,
        userId: actor.id,
        payload: {
          designerAssigned: actor.id,
          orderNumber: order.orderNumber,
        },
      },
    });

    return updated;
  }

  async findOneForUser(orderId: string, user: { id: string; role: UserRole }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderDetailInclude(),
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (user.role === UserRole.CLIENT) {
      if (order.clientId !== user.id) {
        throw new ForbiddenException('Sem permissão para ver este pedido.');
      }
    } else if (user.role === UserRole.DESIGNER) {
      const assignedToMe = order.designerId === user.id;
      const unassignedInQueue =
        order.designerId === null &&
        this.designerUnassignedVisibleStatuses.includes(order.status);
      const unassignedBalcaoDraftShared =
        order.designerId === null &&
        order.status === OrderStatus.DRAFT &&
        order.orderOrigin === OrderOrigin.BALCAO &&
        order.draftSharedWithDesignTeam;
      /** Qualquer designer pode ver pedidos «Finalizado» para registar a entrega em equipa. */
      const openForDelivery = order.status === OrderStatus.FINISHED;
      if (
        !assignedToMe &&
        !unassignedInQueue &&
        !unassignedBalcaoDraftShared &&
        !openForDelivery
      ) {
        throw new ForbiddenException('Sem permissão para ver este pedido.');
      }
    }

    if (
      user.role === UserRole.CLIENT &&
      order.orderOrigin === OrderOrigin.ONLINE
    ) {
      return { ...order, attendant: null };
    }

    return order;
  }

  /**
   * Próximos estados válidos para o utilizador (grafo × perfil).
   * Deixar de ser rascunho (→SUBMITTED) só via POST /orders/:id/submit, não pelo PATCH de estado.
   */
  private computeAllowedNextStatuses(
    status: OrderStatus,
    actor: { id: string; role: UserRole },
    transitionContext?: {
      orderOrigin: OrderOrigin;
      items: { productionProcess: ProductionProcess }[];
    },
  ): OrderStatus[] {
    const candidates = [...(this.transitions[status] ?? [])];
    if (
      transitionContext &&
      this.isBalcaoOnlyStoreRetail(transitionContext) &&
      status !== OrderStatus.DELIVERED &&
      status !== OrderStatus.CANCELLED &&
      status !== OrderStatus.DRAFT &&
      (actor.role === UserRole.ADMIN || actor.role === UserRole.ATTENDANT)
    ) {
      if (!candidates.includes(OrderStatus.DELIVERED)) {
        candidates.push(OrderStatus.DELIVERED);
      }
    }
    return candidates.filter((next) =>
      this.canTransitionByRole(actor.role, status, next, transitionContext),
    );
  }

  /** Lista os próximos estados que o utilizador autenticado pode aplicar a este pedido. */
  async getAllowedNextStatuses(
    orderId: string,
    actor: { id: string; role: UserRole },
  ): Promise<{ allowedNext: OrderStatus[] }> {
    const order = await this.findOneForUser(orderId, actor);
    const transitionContext = {
      orderOrigin: order.orderOrigin,
      items: order.items,
    };
    let allowedNext = this.computeAllowedNextStatuses(
      order.status,
      actor,
      transitionContext,
    );
    const missingProof =
      this.paymentMethodRequiresProof(order.paymentMethod) &&
      !order.paymentProofKey;
    if (missingProof) {
      allowedNext = allowedNext.filter((s) => s === OrderStatus.CANCELLED);
    }
    return { allowedNext };
  }

  /**
   * Quando o pedido passa a APPROVED, descarrega insumos de produção (linhas não-retalho).
   */
  private async applyProductionInsumoDeductionOnApproval(
    orderId: string,
    actorId: string,
  ): Promise<void> {
    const orderLines = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: {
        quantity: true,
        productionProcess: true,
        metadata: true,
      },
    });
    const forConsumo: Array<{
      tipoProduto?: string;
      processo: string;
      quantidade: number;
    }> = [];
    for (const row of orderLines) {
      if (this.metadataIsStoreRetail(row.metadata)) continue;
      const q = row.quantity ?? 0;
      if (q < 1) continue;
      const meta =
        row.metadata &&
        typeof row.metadata === 'object' &&
        !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;
      const tipoProdutoRaw = meta?.garmentType ?? meta?.garment_type;
      const tipoProduto =
        typeof tipoProdutoRaw === 'string'
          ? tipoProdutoRaw
          : typeof tipoProdutoRaw === 'number'
            ? String(tipoProdutoRaw)
            : undefined;
      forConsumo.push({
        ...(tipoProduto ? { tipoProduto } : {}),
        processo: row.productionProcess,
        quantidade: q,
      });
    }
    await this.insumos.descontarPorPedido(orderId, forConsumo, actorId);
  }

  private async cancelOrderWithCompensation(
    order: {
      id: string;
      orderNumber: string;
      status: OrderStatus;
    },
    actor: { id: string; role: UserRole },
    reasonRaw: string | undefined,
  ) {
    const reason = reasonRaw?.trim() ?? '';
    if (reason.length < 3) {
      throw new BadRequestException(
        'Indique o motivo do cancelamento (mínimo de 3 caracteres).',
      );
    }
    if (reason.length > 2000) {
      throw new BadRequestException(
        'O motivo do cancelamento não pode exceder 2000 caracteres.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: order.id, status: order.status },
          data: {
            status: OrderStatus.CANCELLED,
            cancellationReason: reason,
            cancelledAt: new Date(),
            cancelledById: actor.id,
            cancelledFromStatus: order.status,
          },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException(
            'O pedido foi actualizado por outro utilizador. Recarrega e tenta novamente.',
          );
        }

        const restoredStockMovements =
          await this.insumos.restoreOrderStockForCancellation(
            tx,
            order.id,
            actor.id,
          );
        const reversedAmount =
          await this.finance.reverseOrderPaymentForCancellation(tx, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            actorId: actor.id,
            reason,
          });

        await tx.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: order.id,
            orderId: order.id,
            action: AuditAction.STATUS_CHANGE,
            userId: actor.id,
            payload: {
              from: order.status,
              to: OrderStatus.CANCELLED,
              cancellationReason: reason,
              restoredStockMovements,
              reversedAmount,
            },
          },
        });

        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: this.orderDetailInclude(),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Cliente não pode usar este método para DRAFT → SUBMITTED; usar `submitOrderWithProof`.
   */
  async changeStatus(
    orderId: string,
    nextStatus: OrderStatus,
    actor: { id: string; role: UserRole },
    paymentMethod?: PaymentMethod,
    cancellationReason?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        clientId: true,
        designerId: true,
        paymentMethod: true,
        paymentProofKey: true,
        orderOrigin: true,
        draftSharedWithDesignTeam: true,
        items: { select: { productionProcess: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (order.status === nextStatus) {
      return order;
    }

    if (actor.role === UserRole.CLIENT && order.clientId !== actor.id) {
      throw new ForbiddenException('Sem permissão para alterar este pedido.');
    }
    if (actor.role === UserRole.CLIENT) {
      this.assertClientCannotMutateBalcaoOrder(order, actor);
    }
    if (actor.role === UserRole.DESIGNER) {
      /** Alinhado a `findOneForUser`: fila sem designer ou entrega em equipa no «Finalizado». */
      const assignedToMe = order.designerId === actor.id;
      const teamDeliveryFinish =
        order.status === OrderStatus.FINISHED &&
        nextStatus === OrderStatus.DELIVERED;
      const unclaimedButVisible =
        order.designerId === null &&
        (this.designerUnassignedVisibleStatuses.includes(order.status) ||
          (order.status === OrderStatus.DRAFT &&
            order.orderOrigin === OrderOrigin.BALCAO &&
            order.draftSharedWithDesignTeam));
      if (!assignedToMe && !teamDeliveryFinish && !unclaimedButVisible) {
        throw new ForbiddenException('Sem permissão para alterar este pedido.');
      }
    }

    const transitionContext = {
      orderOrigin: order.orderOrigin,
      items: order.items,
    };
    const permitted = this.computeAllowedNextStatuses(
      order.status,
      actor,
      transitionContext,
    );

    if (!permitted.includes(nextStatus)) {
      if (
        order.status === OrderStatus.DRAFT &&
        nextStatus === OrderStatus.SUBMITTED
      ) {
        throw new BadRequestException(
          'Um pedido em rascunho só passa a submetido quando o cliente usa POST /orders/:id/submit com método de pagamento e comprovativo (se o método o exigir). O PATCH de estado não substitui essa submissão.',
        );
      }
      throw new BadRequestException('Transição de estado inválida.');
    }

    const effectivePaymentMethod =
      paymentMethod !== undefined ? paymentMethod : order.paymentMethod;
    if (
      nextStatus !== OrderStatus.CANCELLED &&
      this.paymentMethodRequiresProof(effectivePaymentMethod) &&
      !order.paymentProofKey
    ) {
      throw new BadRequestException(
        'Este método de pagamento exige um comprovativo anexado. Não é possível avançar o estado até existir um ficheiro de comprovativo (PNG, JPG ou PDF) associado ao pedido.',
      );
    }

    const prevStatus = order.status;

    if (nextStatus === OrderStatus.CANCELLED) {
      return this.cancelOrderWithCompensation(order, actor, cancellationReason);
    }

    /** Quem actua na fila sem `designerId` passa a ser o designer oficial (excepto marcar entrega em pedido alheio). */
    const autoAssignDesigner =
      actor.role === UserRole.DESIGNER &&
      order.designerId === null &&
      !(
        order.status === OrderStatus.FINISHED &&
        nextStatus === OrderStatus.DELIVERED
      );

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        ...(autoAssignDesigner ? { designerId: actor.id } : {}),
        ...(paymentMethod !== undefined ? { paymentMethod } : {}),
        ...(nextStatus === OrderStatus.DELIVERED
          ? {
              deliveredById: actor.id,
              deliveredAt: new Date(),
            }
          : {}),
      },
      include: this.orderDetailInclude(),
    });

    if (
      prevStatus === OrderStatus.VALIDATION_PAYMENT &&
      nextStatus === OrderStatus.APPROVED
    ) {
      await this.applyProductionInsumoDeductionOnApproval(orderId, actor.id);
    }

    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: updated.id,
        orderId: updated.id,
        action: AuditAction.STATUS_CHANGE,
        userId: actor.id,
        payload: {
          from: prevStatus,
          to: nextStatus,
          ...(paymentMethod !== undefined ? { paymentMethod } : {}),
        },
      },
    });

    if (nextStatus === OrderStatus.FINISHED) {
      void this.notifications
        .notifyOrderFinished({
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          clientId: updated.clientId,
          clientName: updated.client.name,
          clientPhone: updated.client.phone,
          sentById: actor.id,
        })
        .catch(() => undefined);
    }

    return updated;
  }

  async reopenCancelledOrder(
    orderId: string,
    actor: { id: string; role: UserRole },
    reasonRaw?: string,
  ) {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas administradores podem reabrir pedidos cancelados.',
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        cancelledFromStatus: true,
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== OrderStatus.CANCELLED || !order.cancelledFromStatus) {
      throw new BadRequestException(
        'Apenas pedidos cancelados com estado anterior registado podem ser reabertos.',
      );
    }
    const reason =
      reasonRaw?.trim().slice(0, 2000) || 'Reaberto pelo administrador.';
    const restoredStatus = order.cancelledFromStatus;

    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.CANCELLED },
          data: { status: restoredStatus },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException(
            'O pedido já foi reaberto ou actualizado por outro utilizador.',
          );
        }

        const reappliedStockMovements =
          await this.insumos.reapplyOrderStockForReopen(tx, order.id, actor.id);
        const reactivatedAmount =
          await this.finance.reactivateOrderPaymentForReopen(tx, {
            orderId: order.id,
            orderNumber: order.orderNumber,
            actorId: actor.id,
          });

        await tx.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: order.id,
            orderId: order.id,
            action: AuditAction.STATUS_CHANGE,
            userId: actor.id,
            payload: {
              from: OrderStatus.CANCELLED,
              to: restoredStatus,
              operation: 'REOPEN',
              reason,
              reappliedStockMovements,
              reactivatedAmount,
            },
          },
        });

        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: this.orderDetailInclude(),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async setOrderPrice(
    orderId: string,
    totalAmount: number,
    notes: string | undefined,
    actor: { id: string; role: UserRole },
  ) {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Apenas administradores podem definir o valor do pedido.',
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderOrigin: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    this.assertOnlineOrderNotStaffPriced(order.orderOrigin);
    const data: Prisma.OrderUpdateInput = {
      totalAmount: new Prisma.Decimal(totalAmount),
    };
    if (notes !== undefined) {
      data.notes = notes.trim() ? notes.trim() : null;
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data,
      include: this.orderDetailInclude(),
    });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: orderId,
        orderId,
        action: AuditAction.UPDATE,
        userId: actor.id,
        payload: { totalAmount, notes: notes ?? null },
      },
    });
    return updated;
  }

  async deleteOrder(orderId: string, actor: { id: string; role: UserRole }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clientId: true,
        status: true,
        orderOrigin: true,
        attendantId: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    this.assertAdminCannotDeleteOnlineOrder(order.orderOrigin, actor.role);
    this.assertClientCannotMutateBalcaoOrder(order, actor);
    const attendantOwnDraft =
      actor.role === UserRole.ATTENDANT &&
      order.status === OrderStatus.DRAFT &&
      order.orderOrigin === OrderOrigin.BALCAO &&
      order.attendantId === actor.id;
    const allowed =
      actor.role === UserRole.ADMIN ||
      (actor.role === UserRole.CLIENT &&
        order.clientId === actor.id &&
        order.status === OrderStatus.DRAFT) ||
      attendantOwnDraft;
    if (!allowed) {
      throw new ForbiddenException('Sem permissão para eliminar este pedido.');
    }
    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: orderId,
        orderId,
        action: AuditAction.DELETE,
        userId: actor.id,
        payload: { status: order.status },
      },
    });
    await this.prisma.order.delete({ where: { id: orderId } });
  }

  private readonly paymentProofAllowedMime = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'application/pdf',
  ]);

  private paymentProofDir(orderId: string): string {
    const base = this.config.get<string>('uploadDir') ?? 'uploads';
    return join(process.cwd(), base, 'orders', orderId, 'payment');
  }

  async submitOrderWithProof(
    orderId: string,
    paymentMethod: PaymentMethod,
    proof: MemoryUploadedFile | undefined,
    actor: { id: string; role: UserRole },
    balcaoDiscountAmount?: number,
    balcaoNotes?: string,
    balcaoReceptionDateRaw?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clientId: true,
        status: true,
        orderOrigin: true,
        attendantId: true,
        orderNumber: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (actor.role === UserRole.CLIENT) {
      if (order.clientId !== actor.id) {
        throw new ForbiddenException('Sem permissão para este pedido.');
      }
      this.assertClientCannotMutateBalcaoOrder(order, actor);
    } else if (
      actor.role === UserRole.ADMIN ||
      actor.role === UserRole.ATTENDANT
    ) {
      if (order.orderOrigin !== OrderOrigin.BALCAO) {
        throw new ForbiddenException(
          'Só pedidos criados no balcão podem ser submetidos pelo atendente ou administrador.',
        );
      }
      if (actor.role === UserRole.ATTENDANT && order.attendantId !== actor.id) {
        throw new ForbiddenException(
          'Só o atendente que abriu o rascunho pode submeter este pedido.',
        );
      }
    } else {
      throw new ForbiddenException('Sem permissão para submeter este pedido.');
    }
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Só pedidos em rascunho podem ser submetidos.',
      );
    }

    if (order.orderOrigin === OrderOrigin.BALCAO) {
      await this.finance.ensureBalcaoCashSessionIsOpen();
      const disallowedForBalcao = new Set<PaymentMethod>([
        PaymentMethod.CASH_ON_SITE,
        PaymentMethod.PDV_CREDIT_CARD,
      ]);
      if (disallowedForBalcao.has(paymentMethod)) {
        throw new BadRequestException(
          'Este método não está disponível para pedidos de balcão. Usa dinheiro no balcão, cartão de débito ou transferência / depósito.',
        );
      }
    }

    let paymentProofKey: string | null = null;
    let paymentProofName: string | null = null;
    let paymentProofMime: string | null = null;

    if (proof?.buffer?.length) {
      if (!this.paymentProofAllowedMime.has(proof.mimetype)) {
        throw new BadRequestException('Comprovativo: usa PNG, JPG ou PDF.');
      }
      const dir = this.paymentProofDir(orderId);
      await mkdir(dir, { recursive: true });
      const ext = extname(proof.originalname).toLowerCase();
      const safeExt =
        ext.length > 0 && ext.length <= 8 && /^\.[a-z0-9.]+$/.test(ext)
          ? ext
          : '';
      paymentProofKey = `${randomUUID()}${safeExt || this.extForMime(proof.mimetype)}`;
      const fullPath = join(dir, paymentProofKey);
      await writeFile(fullPath, proof.buffer);
      paymentProofName = proof.originalname.slice(0, 512);
      paymentProofMime = proof.mimetype;
    }

    if (this.paymentMethodRequiresProof(paymentMethod) && !paymentProofKey) {
      throw new BadRequestException(
        'Este método de pagamento exige um comprovativo (PNG, JPG ou PDF).',
      );
    }

    const lineRows = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: {
        unitPrice: true,
        quantity: true,
        metadata: true,
        productionProcess: true,
      },
    });
    let gross = 0;
    for (const it of lineRows) {
      gross += Number(it.unitPrice) * (it.quantity ?? 0);
    }
    gross = Math.round(gross * 100) / 100;

    const instantBalcaoInsumosOnly =
      order.orderOrigin === OrderOrigin.BALCAO &&
      this.isBalcaoOnlyStoreRetail({
        orderOrigin: order.orderOrigin,
        items: lineRows,
      });

    const retailLines: Array<{ insumoId: string; quantity: number }> = [];

    if (order.orderOrigin === OrderOrigin.BALCAO) {
      for (const it of lineRows) {
        if (!this.metadataIsStoreRetail(it.metadata)) continue;
        const insumoId = it.metadata.insumoId;
        const q = it.quantity ?? 0;
        if (q < 1) {
          throw new BadRequestException(
            'Linha de insumo ao balcão com quantidade inválida.',
          );
        }
        const insumo = await this.prisma.insumo.findFirst({
          where: { id: insumoId, activo: true },
          select: { id: true, stockActual: true, unidade: true, nome: true },
        });
        if (!insumo) {
          throw new BadRequestException(
            'Um dos insumos da venda já não está disponível. Atualiza o pedido.',
          );
        }
        const need = new Prisma.Decimal(q);
        const stock = new Prisma.Decimal(insumo.stockActual);
        if (stock.lt(need)) {
          throw new BadRequestException(
            `Stock insuficiente para «${insumo.nome}». Disponível: ${insumo.stockActual.toString()} ${insumo.unidade}.`,
          );
        }
        retailLines.push({ insumoId, quantity: q });
      }
    }

    let discountToApply = 0;
    if (order.orderOrigin === OrderOrigin.BALCAO) {
      if (actor.role === UserRole.ADMIN || actor.role === UserRole.ATTENDANT) {
        discountToApply =
          balcaoDiscountAmount !== undefined && balcaoDiscountAmount !== null
            ? balcaoDiscountAmount
            : 0;
      }
    } else if (
      balcaoDiscountAmount !== undefined &&
      balcaoDiscountAmount !== null &&
      balcaoDiscountAmount > 0
    ) {
      throw new BadRequestException(
        'Desconto na submissão só é permitido para pedidos de balcão.',
      );
    }

    if (!Number.isFinite(discountToApply) || discountToApply < 0) {
      throw new BadRequestException('Desconto inválido.');
    }
    discountToApply = Math.round(discountToApply * 100) / 100;
    if (discountToApply > gross) {
      discountToApply = gross;
    }
    const netTotal = Math.round((gross - discountToApply) * 100) / 100;

    const staffBalcaoSubmit =
      order.orderOrigin === OrderOrigin.BALCAO &&
      (actor.role === UserRole.ADMIN || actor.role === UserRole.ATTENDANT);

    let notesToApply: string | null | undefined;
    if (staffBalcaoSubmit && balcaoNotes !== undefined) {
      notesToApply = balcaoNotes.trim() ? balcaoNotes.trim() : null;
    }

    let receptionDateToApply: Date | null | undefined;
    if (staffBalcaoSubmit && balcaoReceptionDateRaw !== undefined) {
      const trimmed = balcaoReceptionDateRaw.trim();
      if (!trimmed) {
        receptionDateToApply = null;
      } else {
        const parsed = new Date(trimmed);
        if (!Number.isFinite(parsed.getTime())) {
          throw new BadRequestException('Data de recepção inválida.');
        }
        receptionDateToApply = parsed;
      }
    }

    let statusAfterPayment: OrderStatus;
    if (instantBalcaoInsumosOnly) {
      statusAfterPayment = OrderStatus.DELIVERED;
    } else if (staffBalcaoSubmit) {
      /** PDV (admin ou atendente): pagamento registado; «Aprovado» só depois (designer ou admin por PATCH). */
      statusAfterPayment = OrderStatus.VALIDATION_PAYMENT;
    } else {
      statusAfterPayment = OrderStatus.SUBMITTED;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: orderId },
        data: {
          status: statusAfterPayment,
          paymentMethod,
          paymentProofKey,
          paymentProofName,
          paymentProofMime,
          totalAmount: new Prisma.Decimal(netTotal),
          discountAmount: new Prisma.Decimal(discountToApply),
          ...(notesToApply !== undefined ? { notes: notesToApply } : {}),
          ...(receptionDateToApply !== undefined
            ? { receptionDate: receptionDateToApply }
            : {}),
        },
        include: this.orderDetailInclude(),
      });

      await tx.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: orderId,
          orderId,
          action: AuditAction.STATUS_CHANGE,
          userId: actor.id,
          payload: {
            from: OrderStatus.DRAFT,
            to: statusAfterPayment,
            paymentMethod,
            hasProof: Boolean(proof?.buffer?.length),
            balcaoInstantRetail: instantBalcaoInsumosOnly,
          },
        },
      });

      await this.finance.recordLedgerEntryForOrderPayment(tx, {
        orderId: u.id,
        orderNumber: u.orderNumber,
        actorId: actor.id,
        paymentMethod,
        orderOrigin: u.orderOrigin,
        attendantId: u.attendantId ?? null,
        grossAmount: gross,
        discountAmount: discountToApply,
        netAmount: netTotal,
        currency: u.currency,
      });

      return u;
    });

    if (retailLines.length > 0) {
      const notaBase = `Venda balcão ${order.orderNumber}`;
      for (const row of retailLines) {
        await this.insumos.addMovimento(
          row.insumoId,
          {
            tipo: MovimentoTipo.SAIDA_PEDIDO,
            quantidade: row.quantity,
            nota: notaBase,
          },
          actor.id,
          orderId,
        );
      }
    }

    return updated;
  }

  /**
   * Stream do ficheiro de comprovativo de pagamento (cliente envia no submit).
   * Quem pode ver o pedido (findOneForUser) pode ver o anexo.
   */
  async getPaymentProofStream(
    orderId: string,
    user: { id: string; role: UserRole },
  ): Promise<{
    stream: ReturnType<typeof createReadStream>;
    mimeType: string;
    downloadName: string;
  }> {
    await this.findOneForUser(orderId, user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        paymentProofKey: true,
        paymentProofMime: true,
        paymentProofName: true,
      },
    });
    if (!order?.paymentProofKey) {
      throw new NotFoundException(
        'Este pedido não tem comprovativo de pagamento.',
      );
    }
    const fullPath = join(this.paymentProofDir(orderId), order.paymentProofKey);
    try {
      await access(fullPath);
    } catch {
      throw new NotFoundException('Comprovativo em falta no armazenamento.');
    }
    return {
      stream: createReadStream(fullPath),
      mimeType: order.paymentProofMime ?? 'application/octet-stream',
      downloadName: order.paymentProofName ?? 'comprovativo',
    };
  }

  async listModelagemFiles(
    orderId: string,
    user: { id: string; role: UserRole },
  ) {
    await this.findOneForUser(orderId, user);
    await this.assertAttendantOwnCounterOrderForArtAccess(orderId, user);
    return this.prisma.orderClientFile.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
  }

  async uploadModelagemFile(
    orderId: string,
    file: MemoryUploadedFile,
    user: { id: string; role: UserRole },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clientId: true,
        designerId: true,
        attendantId: true,
        status: true,
        orderOrigin: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (user.role === UserRole.CLIENT) {
      if (order.clientId !== user.id) {
        throw new ForbiddenException('Sem permissão para este pedido.');
      }
      this.assertClientCannotMutateBalcaoOrder(order, user);
      this.assertClientModelagemDraftOnly(order.status);
    } else if (
      user.role === UserRole.ADMIN ||
      user.role === UserRole.ATTENDANT
    ) {
      if (user.role === UserRole.ATTENDANT) {
        if (
          order.orderOrigin !== OrderOrigin.BALCAO ||
          !order.attendantId ||
          order.attendantId !== user.id
        ) {
          throw new ForbiddenException(
            'Só podes anexar ficheiros de modelagem aos pedidos de balcão que iniciaste.',
          );
        }
      }
    } else if (user.role === UserRole.DESIGNER) {
      if (order.designerId !== user.id) {
        throw new ForbiddenException(
          'Sem permissão para enviar ficheiros neste pedido.',
        );
      }
      if (
        order.status !== OrderStatus.DRAFT ||
        order.orderOrigin !== OrderOrigin.BALCAO
      ) {
        throw new ForbiddenException(
          'O designer só pode anexar ficheiros em rascunhos de balcão que tenha a seu cargo.',
        );
      }
    } else {
      throw new ForbiddenException(
        'Sem permissão para enviar ficheiros neste pedido.',
      );
    }
    if (!this.modelagemAllowedMime.has(file.mimetype)) {
      throw new BadRequestException(
        'Tipo não permitido. Usa PNG, JPG, SVG ou PDF.',
      );
    }
    const dir = this.modelagemOrderDir(orderId);
    await mkdir(dir, { recursive: true });
    const ext = extname(file.originalname).toLowerCase();
    const safeExt =
      ext.length > 0 && ext.length <= 8 && /^\.[a-z0-9.]+$/.test(ext)
        ? ext
        : '';
    const storageKey = `${randomUUID()}${safeExt || this.extForMime(file.mimetype)}`;
    const fullPath = join(dir, storageKey);
    await writeFile(fullPath, file.buffer);

    const row = await this.prisma.orderClientFile.create({
      data: {
        orderId,
        originalName: file.originalname.slice(0, 512),
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: user.id,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'OrderClientFile',
        entityId: row.id,
        orderId,
        action: AuditAction.CREATE,
        userId: user.id,
        payload: {
          originalName: row.originalName,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
        },
      },
    });

    return row;
  }

  async getModelagemFileStream(
    orderId: string,
    fileId: string,
    user: { id: string; role: UserRole },
  ) {
    await this.findOneForUser(orderId, user);
    await this.assertAttendantOwnCounterOrderForArtAccess(orderId, user);
    const row = await this.prisma.orderClientFile.findFirst({
      where: { id: fileId, orderId },
    });
    if (!row) {
      throw new NotFoundException('Ficheiro não encontrado.');
    }
    const fullPath = join(this.modelagemOrderDir(orderId), row.storageKey);
    try {
      await access(fullPath);
    } catch {
      throw new NotFoundException('Ficheiro em falta no armazenamento.');
    }
    return {
      stream: createReadStream(fullPath),
      mimeType: row.mimeType,
      downloadName: row.originalName,
    };
  }

  /**
   * Último PNG gravado pela modelagem (`ArtVersion`). Permissões iguais a `findOneForUser`;
   * atendente só se for o criador do rascunho de balcão (`attendantId`).
   */
  async getLatestArtVersionStream(
    orderId: string,
    user: { id: string; role: UserRole },
  ): Promise<{
    stream: ReturnType<typeof createReadStream>;
    mimeType: string;
    downloadName: string;
  }> {
    await this.findOneForUser(orderId, user);
    await this.assertAttendantOwnCounterOrderForArtAccess(orderId, user);

    const row = await this.prisma.artVersion.findFirst({
      where: { orderId },
      orderBy: { versionIndex: 'desc' },
      select: { storageKey: true },
    });
    const keyRaw = row?.storageKey?.trim();
    if (!keyRaw) {
      throw new NotFoundException(
        'Este pedido ainda não tem arte gravada no editor.',
      );
    }
    if (
      keyRaw.includes('..') ||
      keyRaw.includes('/') ||
      keyRaw.includes('\\')
    ) {
      throw new BadRequestException('Chave de ficheiro inválida.');
    }
    const fullPath = join(this.modelagemArtDir(orderId), keyRaw);
    try {
      await access(fullPath);
    } catch {
      throw new NotFoundException(
        'Ficheiro de arte em falta no armazenamento.',
      );
    }
    const downloadName = `arte-${orderId.slice(0, 8)}.png`;
    return {
      stream: createReadStream(fullPath),
      mimeType: 'image/png',
      downloadName,
    };
  }

  async deleteModelagemFile(
    orderId: string,
    fileId: string,
    user: { id: string; role: UserRole },
  ) {
    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException(
        'Apenas o cliente pode remover ficheiros de modelagem.',
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, clientId: true, status: true, orderOrigin: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (order.clientId !== user.id) {
      throw new ForbiddenException('Sem permissão para este pedido.');
    }
    this.assertClientCannotMutateBalcaoOrder(order, user);
    this.assertClientModelagemDraftOnly(order.status);
    const row = await this.prisma.orderClientFile.findFirst({
      where: { id: fileId, orderId },
    });
    if (!row) {
      throw new NotFoundException('Ficheiro não encontrado.');
    }
    const fullPath = join(this.modelagemOrderDir(orderId), row.storageKey);
    try {
      await unlink(fullPath);
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? (e as NodeJS.ErrnoException).code
          : undefined;
      if (code !== 'ENOENT') {
        throw e;
      }
    }
    await this.prisma.orderClientFile.delete({ where: { id: row.id } });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'OrderClientFile',
        entityId: row.id,
        orderId,
        action: AuditAction.DELETE,
        userId: user.id,
        payload: {
          originalName: row.originalName,
          mimeType: row.mimeType,
        },
      },
    });
  }

  /**
   * Guarda o PNG da composição 2D do cliente como nova ArtVersion (rascunho).
   */
  async saveModelagemComposition(
    orderId: string,
    dto: SaveCompositionDto,
    user: { id: string; role: UserRole },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clientId: true,
        designerId: true,
        attendantId: true,
        status: true,
        orderOrigin: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (user.role === UserRole.CLIENT) {
      if (order.clientId !== user.id) {
        throw new ForbiddenException('Sem permissão para este pedido.');
      }
      this.assertClientCannotMutateBalcaoOrder(order, user);
      this.assertClientModelagemDraftOnly(order.status);
    } else if (user.role === UserRole.DESIGNER) {
      if (order.designerId !== user.id) {
        throw new ForbiddenException(
          'Só o designer atribuído pode guardar a composição deste pedido.',
        );
      }
      if (
        order.status !== OrderStatus.DRAFT ||
        order.orderOrigin !== OrderOrigin.BALCAO
      ) {
        throw new ForbiddenException(
          'O designer só pode guardar composição em rascunhos de balcão a si atribuídos.',
        );
      }
      this.assertClientModelagemDraftOnly(order.status);
    } else if (
      user.role === UserRole.ADMIN ||
      user.role === UserRole.ATTENDANT
    ) {
      if (
        order.status !== OrderStatus.DRAFT ||
        order.orderOrigin !== OrderOrigin.BALCAO
      ) {
        throw new ForbiddenException(
          'Administrador e atendente só podem guardar composição em rascunhos de pedidos de balcão.',
        );
      }
      if (
        user.role === UserRole.ATTENDANT &&
        order.attendantId != null &&
        order.attendantId !== user.id
      ) {
        throw new ForbiddenException(
          'Só o atendente que abriu este rascunho pode guardar a composição.',
        );
      }
    } else {
      throw new ForbiddenException(
        'Apenas o cliente, o designer atribuído (balcão) ou a equipa do PDV em rascunho de balcão podem guardar a composição.',
      );
    }

    let raw = dto.pngBase64.trim();
    const dataUrl = /^data:image\/png;base64,(.+)$/i.exec(raw);
    if (dataUrl) {
      raw = dataUrl[1]!;
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, 'base64');
    } catch {
      throw new BadRequestException('Base64 inválido.');
    }
    const maxBytes = 12 * 1024 * 1024;
    if (buffer.length < 32 || buffer.length > maxBytes) {
      throw new BadRequestException(
        'Imagem inválida ou demasiado grande (máx. 12 MB).',
      );
    }
    const pngSig = buffer.subarray(0, 8);
    if (
      pngSig[0] !== 0x89 ||
      pngSig[1] !== 0x50 ||
      pngSig[2] !== 0x4e ||
      pngSig[3] !== 0x47
    ) {
      throw new BadRequestException('O ficheiro tem de ser PNG.');
    }

    let layersPayload:
      | Prisma.InputJsonValue
      | typeof Prisma.JsonNull
      | undefined;
    if (dto.layersJson !== undefined) {
      const jsonStr =
        typeof dto.layersJson === 'string'
          ? dto.layersJson
          : JSON.stringify(dto.layersJson);
      const maxLayersJson = 14 * 1024 * 1024;
      if (jsonStr.length > maxLayersJson) {
        throw new BadRequestException(
          'Dados das camadas demasiado grandes para guardar (máx. ~14 MB).',
        );
      }
      try {
        layersPayload = JSON.parse(jsonStr) as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('layersJson não é JSON válido.');
      }
    }

    const dir = this.modelagemArtDir(orderId);
    await mkdir(dir, { recursive: true });
    const storageKey = `${randomUUID()}.png`;
    const fullPath = join(dir, storageKey);
    await writeFile(fullPath, buffer);

    const checksum = createHash('sha256').update(buffer).digest('hex');

    const last = await this.prisma.artVersion.findFirst({
      where: { orderId },
      orderBy: { versionIndex: 'desc' },
      select: { versionIndex: true },
    });
    const versionIndex = (last?.versionIndex ?? 0) + 1;

    const row = await this.prisma.artVersion.create({
      data: {
        orderId,
        versionIndex,
        status: ArtVersionStatus.DRAFT,
        storageKey,
        createdById: user.id,
        checksum,
        ...(layersPayload !== undefined
          ? {
              layersJson:
                layersPayload === null ? Prisma.JsonNull : layersPayload,
            }
          : {}),
      },
      select: {
        id: true,
        versionIndex: true,
        status: true,
        createdAt: true,
        checksum: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'ArtVersion',
        entityId: row.id,
        orderId,
        action: AuditAction.CREATE,
        userId: user.id,
        payload: {
          versionIndex: row.versionIndex,
          kind: 'client_composition_png',
          bytes: buffer.length,
          hasLayersJson:
            dto.layersJson !== undefined && dto.layersJson !== null,
        },
      },
    });

    return row;
  }

  /** Especificações textuais / linhas (nome, tamanho, cor, frente/verso) — apoio a pedidos com várias variantes na mesma arte. */
  async updateModelagemSpecs(
    orderId: string,
    body: unknown,
    user: { id: string; role: UserRole },
  ) {
    const order = await this.findOneForUser(orderId, user);

    if (user.role === UserRole.CLIENT) {
      const o = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          clientId: true,
          status: true,
          orderOrigin: true,
        },
      });
      if (!o) {
        throw new NotFoundException('Pedido não encontrado.');
      }
      this.assertClientCannotMutateBalcaoOrder(o, user);
      this.assertClientModelagemDraftOnly(o.status);
    }

    if (user.role === UserRole.ATTENDANT) {
      if (order.orderOrigin !== OrderOrigin.BALCAO) {
        throw new ForbiddenException(
          'Atendente só pode editar estas especificações em pedidos de balcão.',
        );
      }
      if (order.attendantId != null && order.attendantId !== user.id) {
        throw new ForbiddenException(
          'Só o atendente que abriu este pedido de balcão pode alterar estas especificações.',
        );
      }
    }

    const validated = parseAndValidateModelagemSpecs(body);
    const payload = validated as Prisma.InputJsonValue;

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { modelagemSpecs: payload },
      include: this.orderDetailInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: orderId,
        orderId,
        action: AuditAction.UPDATE,
        userId: user.id,
        payload: {
          modelagemSpecsUpdate: true,
          numLinhas: validated.linhas.length,
        },
      },
    });

    return updated;
  }
}
