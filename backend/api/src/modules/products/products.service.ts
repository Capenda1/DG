import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, CatalogFamily } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_PRODUCT_CATALOG_TEMPLATES,
  mergeWithDefaultCatalogTemplates,
  normalizeCatalogTemplates,
  PRODUCT_CATALOG_TEMPLATES_KEY,
  type ProductCatalogTemplate,
} from './product-catalog.defaults';
import type { CreateProductDto } from './dto/create-product.dto';
import type { CreateProductVariantDto } from './dto/create-variant.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { UpdateProductVariantDto } from './dto/update-variant.dto';

/** Chaves de cor oficiais (catálogo Dádiva) — alinhar com `apparel-catalog.ts`. */
const CATALOG_COLOR_PRICE_COLOR_IDS = new Set([
  'branco',
  'rosa-bebe',
  'rosa-carregado',
  'amarelo',
  'azul-bebe',
  'azul-escuro',
  'azul-lapizeira',
  'vermelho',
  'castanho',
  'leite',
  'cinza',
  'verde',
  'verde-alface',
  'verde-militar',
  'laranja',
  'vinho',
  'violata',
  'preta',
]);

/** Chaves de marca em `colorPrices` por marca adulta. */
const CATALOG_COLOR_PRICE_BRAND_IDS = new Set([
  'PK_LEVE',
  'BUK_NOVA_NORMAL',
  'BUK_MAX_PESADA',
  'POLO_LACOST_PESADA',
  'POLO_LACOST_LEVE',
  'POLO_LACOST_PESADA_CHILD',
  'POLO_LACOST_LEVE_CHILD',
  'COLETE_NORMAL',
  'COLETE_PESADA',
  'BONE_COM_REDE',
  'BONE_SEM_REDE',
]);

type ColorBand = { adult?: number; child?: number };

type ColorPriceEntry = {
  adult?: number;
  child?: number;
  sublimation?: ColorBand;
  dtf?: ColorBand;
};

type ParsedColorPricesJson = {
  legacyByColor: Record<string, ColorPriceEntry> | null;
  byAdultBrand: Record<string, Record<string, ColorPriceEntry>>;
};

@Injectable()
export class ProductsService {
  private readonly childSizesForPriceSync = new Set([
    '1/2',
    '3/4',
    '5/6',
    '7/8',
    '9/10',
    '11/12',
    '13/14',
    '15/16',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catálogo para clientes: produtos activos com variantes activas.
   * Inclui variantes sem `productionProcess` (legado); o app infere o processo pela cor.
   */
  listCatalogForClient() {
    return this.prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        catalogFamily: true,
        familyConfig: true,
        variants: {
          where: { active: true },
          orderBy: [{ baseColor: 'asc' }, { size: 'asc' }],
          select: {
            id: true,
            sku: true,
            size: true,
            baseColor: true,
            productionProcess: true,
            garmentType: true,
            unitPrice: true,
            currency: true,
            metadata: true,
            active: true,
          },
        },
      },
    });
  }

  listForAdmin(params?: {
    q?: string;
    take?: number;
    skip?: number;
    status?: ProductStatus;
    catalogLine?: 'APPAREL' | 'GENERIC';
    catalogFamily?: CatalogFamily;
  }) {
    const take = Math.min(Math.max(params?.take ?? 50, 1), 100);
    const skip = Math.min(Math.max(params?.skip ?? 0, 0), 50_000);
    const rawQ = params?.q?.trim();
    const andParts: Prisma.ProductWhereInput[] = [];
    if (rawQ && rawQ.length > 0) {
      andParts.push({
        OR: [
          {
            name: {
              contains: rawQ,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            code: {
              contains: rawQ,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      });
    }
    if (params?.status) {
      andParts.push({ status: params.status });
    }
    if (params?.catalogFamily) {
      andParts.push({ catalogFamily: params.catalogFamily });
    } else if (params?.catalogLine === 'APPAREL') {
      andParts.push({ catalogFamily: CatalogFamily.VESTUARIO });
    } else if (params?.catalogLine === 'GENERIC') {
      andParts.push({ catalogFamily: { not: CatalogFamily.VESTUARIO } });
    }
    const where: Prisma.ProductWhereInput =
      andParts.length === 0 ? {} : { AND: andParts };

    const variantWhereCatalog: Prisma.ProductVariantWhereInput = {
      active: true,
      product: { status: ProductStatus.ACTIVE },
    };

    const include = {
      variants: { orderBy: [{ sku: 'asc' as const }] },
    };

    return this.prisma
      .$transaction([
        this.prisma.product.findMany({
          where,
          orderBy: [{ status: 'asc' }, { name: 'asc' }],
          take,
          skip,
          include,
        }),
        this.prisma.product.count({ where }),
        this.prisma.productVariant.count(),
        this.prisma.product.count({
          where: { status: ProductStatus.ACTIVE },
        }),
        this.prisma.productVariant.count({
          where: variantWhereCatalog,
        }),
      ])
      .then(
        ([
          items,
          total,
          variantCountAll,
          activeProducts,
          activeVariantsInCatalog,
        ]) => ({
          items,
          total,
          catalogStats: {
            variantCountAll,
            activeProducts,
            activeVariantsInCatalog,
          },
        }),
      );
  }

  async findOneForAdmin(productId: string) {
    const row = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: { orderBy: [{ sku: 'asc' }] },
      },
    });
    if (!row) {
      throw new NotFoundException('Produto não encontrado.');
    }
    return row;
  }

  /**
   * Cria várias variantes num só pedido. Máx. 250; o cliente pode enviar vários lotes.
   */
  async createVariantsBatch(
    productId: string,
    dtos: CreateProductVariantDto[],
  ): Promise<{ created: number; errors: string[] }> {
    await this.ensureProduct(productId);
    const errors: string[] = [];
    if (dtos.length > 250) {
      errors.push(
        'Lote truncado a 250 variantes por pedido — reenviar o excesso.',
      );
    }
    const capped = dtos.slice(0, 250);
    let created = 0;
    for (const dto of capped) {
      const skuSafe = dto.sku?.trim() ?? '?';
      try {
        await this.prisma.productVariant.create({
          data: {
            productId,
            sku: skuSafe,
            size: dto.size?.trim() || null,
            baseColor: dto.baseColor?.trim() || null,
            productionProcess: dto.productionProcess,
            garmentType: dto.garmentType?.trim() || null,
            unitPrice: new Prisma.Decimal(dto.unitPrice),
            currency: 'AOA',
            metadata:
              dto.metadata != null
                ? (dto.metadata as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            active: dto.active ?? true,
          },
        });
        created++;
      } catch (e) {
        const label = skuSafe;
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          errors.push(`${label}: SKU duplicado.`);
          continue;
        }
        errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { created, errors };
  }

  async createProduct(dto: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: {
          code: dto.code.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          catalogFamily: dto.catalogFamily ?? CatalogFamily.GENERICO,
          familyConfig:
            dto.familyConfig != null
              ? (dto.familyConfig as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          status: dto.status ?? ProductStatus.ACTIVE,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Já existe um produto com este código.');
      }
      throw e;
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.ensureProduct(id);
    await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.status != null ? { status: dto.status } : {}),
        ...(dto.catalogFamily != null
          ? { catalogFamily: dto.catalogFamily }
          : {}),
        ...(dto.familyConfig !== undefined
          ? {
              familyConfig:
                dto.familyConfig === null
                  ? Prisma.JsonNull
                  : (dto.familyConfig as Prisma.InputJsonValue),
            }
          : {}),
        ...(dto.colorPrices !== undefined
          ? {
              colorPrices:
                dto.colorPrices === null
                  ? Prisma.JsonNull
                  : (dto.colorPrices as Prisma.InputJsonValue),
            }
          : {}),
      },
    });
    if (dto.colorPrices !== undefined) {
      await this.syncVariantPricesFromColorTable(id);
    }
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: { variants: { orderBy: [{ sku: 'asc' }] } },
    });
  }

  async createVariant(productId: string, dto: CreateProductVariantDto) {
    await this.ensureProduct(productId);
    try {
      return await this.prisma.productVariant.create({
        data: {
          productId,
          sku: dto.sku.trim(),
          size: dto.size?.trim() || null,
          baseColor: dto.baseColor?.trim() || null,
          productionProcess: dto.productionProcess,
          garmentType: dto.garmentType?.trim() || null,
          unitPrice: new Prisma.Decimal(dto.unitPrice),
          currency: 'AOA',
          metadata:
            dto.metadata != null
              ? (dto.metadata as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          active: dto.active ?? true,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Já existe uma variante com este SKU.');
      }
      throw e;
    }
  }

  async deleteProduct(id: string) {
    await this.ensureProduct(id);
    await this.prisma.product.delete({ where: { id } });
  }

  async deleteVariant(productId: string, variantId: string) {
    const v = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!v) {
      throw new NotFoundException('Variante não encontrada neste produto.');
    }
    await this.prisma.productVariant.delete({ where: { id: variantId } });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ) {
    const v = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!v) {
      throw new NotFoundException('Variante não encontrada neste produto.');
    }
    try {
      return await this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          ...(dto.sku != null ? { sku: dto.sku.trim() } : {}),
          ...(dto.size !== undefined ? { size: dto.size?.trim() || null } : {}),
          ...(dto.baseColor !== undefined
            ? { baseColor: dto.baseColor?.trim() || null }
            : {}),
          ...(dto.productionProcess !== undefined
            ? { productionProcess: dto.productionProcess }
            : {}),
          ...(dto.garmentType !== undefined
            ? { garmentType: dto.garmentType?.trim() || null }
            : {}),
          ...(dto.unitPrice != null
            ? {
                unitPrice: new Prisma.Decimal(dto.unitPrice),
                currency: 'AOA',
              }
            : {}),
          ...(dto.currency != null ? { currency: 'AOA' } : {}),
          ...(dto.metadata !== undefined
            ? {
                metadata:
                  dto.metadata === null
                    ? Prisma.JsonNull
                    : (dto.metadata as Prisma.InputJsonValue),
              }
            : {}),
          ...(dto.active != null ? { active: dto.active } : {}),
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Já existe uma variante com este SKU.');
      }
      throw e;
    }
  }

  private async ensureProduct(id: string) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) {
      throw new NotFoundException('Produto não encontrado.');
    }
    return p;
  }

  /** Aplica `product.colorPrices` a todas as variantes (cor × faixa × marca × processo). */
  private async syncVariantPricesFromColorTable(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        colorPrices: true,
        variants: true,
      },
    });
    if (!product?.colorPrices || typeof product.colorPrices !== 'object') {
      return;
    }
    const parsed = this.parseProductColorPricesJson(product.colorPrices);
    const updates: { id: string; unitPrice: Prisma.Decimal }[] = [];
    for (const v of product.variants) {
      const colorRaw = v.baseColor?.trim();
      if (!colorRaw) continue;
      const meta = v.metadata as Record<string, unknown> | null;
      let age: 'ADULT' | 'CHILD' = 'ADULT';
      if (meta?.ageBand === 'CHILD') age = 'CHILD';
      else if (meta?.ageBand === 'ADULT') age = 'ADULT';
      else {
        const sz = v.size?.trim() ?? '';
        if (this.childSizesForPriceSync.has(sz)) age = 'CHILD';
      }
      const brandIdRaw = meta?.brandId;
      const brandId =
        typeof brandIdRaw === 'string' || typeof brandIdRaw === 'number'
          ? String(brandIdRaw)
          : undefined;
      const anchor = this.priceAnchorBrand(v.garmentType, brandId, age);
      const entry = this.lookupPriceEntry(parsed, anchor, colorRaw);
      if (!entry) continue;
      const proc: 'SUBLIMATION' | 'DTF' =
        v.productionProcess === 'DTF' ? 'DTF' : 'SUBLIMATION';
      const rawPrice = this.pickPriceForProcess(entry, age, proc);
      if (
        rawPrice === undefined ||
        typeof rawPrice !== 'number' ||
        !Number.isFinite(rawPrice) ||
        rawPrice < 0
      ) {
        continue;
      }
      updates.push({
        id: v.id,
        unitPrice: new Prisma.Decimal(rawPrice),
      });
    }
    if (updates.length === 0) return;
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.productVariant.update({
          where: { id: u.id },
          data: {
            unitPrice: u.unitPrice,
            currency: 'AOA',
          },
        }),
      ),
    );
  }

  private readBand(x: unknown): { adult?: number; child?: number } | undefined {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
    const b = x as Record<string, unknown>;
    const adult =
      typeof b.adult === 'number' && Number.isFinite(b.adult)
        ? b.adult
        : undefined;
    const child =
      typeof b.child === 'number' && Number.isFinite(b.child)
        ? b.child
        : undefined;
    if (adult === undefined && child === undefined) return undefined;
    return { adult, child };
  }

  private parseColorPriceEntry(v: unknown): ColorPriceEntry | undefined {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const o = v as Record<string, unknown>;
    const out: ColorPriceEntry = {};
    const topAdult =
      typeof o.adult === 'number' && Number.isFinite(o.adult)
        ? o.adult
        : undefined;
    const topChild =
      typeof o.child === 'number' && Number.isFinite(o.child)
        ? o.child
        : undefined;
    if (topAdult !== undefined) out.adult = topAdult;
    if (topChild !== undefined) out.child = topChild;
    const sub = this.readBand(o.sublimation);
    if (sub) out.sublimation = sub;
    const dtf = this.readBand(o.dtf);
    if (dtf) out.dtf = dtf;
    if (Object.keys(out).length === 0) return undefined;
    return out;
  }

  private entryHasAnyPrice(e: ColorPriceEntry): boolean {
    if (e.adult !== undefined || e.child !== undefined) return true;
    if (
      e.sublimation?.adult !== undefined ||
      e.sublimation?.child !== undefined
    ) {
      return true;
    }
    if (e.dtf?.adult !== undefined || e.dtf?.child !== undefined) return true;
    return false;
  }

  private parseColorPriceMap(
    raw: Record<string, unknown>,
  ): Record<string, ColorPriceEntry> {
    const out: Record<string, ColorPriceEntry> = {};
    for (const [k, v] of Object.entries(raw)) {
      const e = this.parseColorPriceEntry(v);
      if (e && this.entryHasAnyPrice(e)) out[k] = e;
    }
    return out;
  }

  private isDirectLegacyScalarEntry(v: unknown): boolean {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    const onlyTop = typeof o.adult === 'number' || typeof o.child === 'number';
    const hasNested = o.sublimation !== undefined || o.dtf !== undefined;
    return onlyTop && !hasNested;
  }

  private parseProductColorPricesJson(raw: unknown): ParsedColorPricesJson {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { legacyByColor: {}, byAdultBrand: {} };
    }
    const o = raw as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 0) {
      return { legacyByColor: {}, byAdultBrand: {} };
    }

    const allColorKeys = keys.every((k) =>
      CATALOG_COLOR_PRICE_COLOR_IDS.has(k),
    );
    if (allColorKeys) {
      return {
        legacyByColor: this.parseColorPriceMap(o),
        byAdultBrand: {},
      };
    }

    const allBrandKeys = keys.every((k) =>
      CATALOG_COLOR_PRICE_BRAND_IDS.has(k),
    );
    if (allBrandKeys) {
      const byAdultBrand: Record<string, Record<string, ColorPriceEntry>> = {};
      for (const [bk, bv] of Object.entries(o)) {
        if (!bv || typeof bv !== 'object' || Array.isArray(bv)) continue;
        const inner = this.parseColorPriceMap(bv as Record<string, unknown>);
        if (Object.keys(inner).length > 0) {
          byAdultBrand[bk] = inner;
        }
      }
      return { legacyByColor: null, byAdultBrand };
    }

    let anyDirect = false;
    for (const v of Object.values(o)) {
      if (this.isDirectLegacyScalarEntry(v)) {
        anyDirect = true;
        break;
      }
    }
    if (anyDirect) {
      return {
        legacyByColor: this.parseColorPriceMap(o),
        byAdultBrand: {},
      };
    }

    const byAdultBrand: Record<string, Record<string, ColorPriceEntry>> = {};
    for (const [bk, bv] of Object.entries(o)) {
      if (!bv || typeof bv !== 'object' || Array.isArray(bv)) continue;
      const inner = this.parseColorPriceMap(bv as Record<string, unknown>);
      if (Object.keys(inner).length > 0) {
        byAdultBrand[bk] = inner;
      }
    }
    return { legacyByColor: null, byAdultBrand };
  }

  private entryForColor(
    map: Record<string, ColorPriceEntry>,
    colorRaw: string,
  ): ColorPriceEntry | undefined {
    const id = colorRaw.trim();
    return map[id] ?? map[id.toLowerCase()] ?? map[id.toUpperCase()];
  }

  private priceAnchorBrand(
    garmentType: string | null | undefined,
    variantBrandId: string | undefined,
    age: 'ADULT' | 'CHILD',
  ): string {
    const g = (garmentType ?? '').trim();
    const b = (variantBrandId ?? '').trim();
    if (age === 'ADULT') return b || '__NONE__';
    if (g === 'POLO') {
      if (b === 'POLO_LACOST_PESADA_CHILD') return 'POLO_LACOST_PESADA';
      if (b === 'POLO_LACOST_LEVE_CHILD') return 'POLO_LACOST_LEVE';
    }
    if (g === 'T_SHIRT' || g === 'PERSONALIZADO' || g === 'EQUIPAMENTOS') {
      return 'BUK_MAX_PESADA';
    }
    return b || '__NONE__';
  }

  private lookupPriceEntry(
    parsed: ParsedColorPricesJson,
    anchorBrand: string,
    colorRaw: string,
  ): ColorPriceEntry | undefined {
    const colorMaps = parsed.byAdultBrand[anchorBrand];
    if (colorMaps && Object.keys(colorMaps).length > 0) {
      const e = this.entryForColor(colorMaps, colorRaw);
      if (e && this.entryHasAnyPrice(e)) return e;
    }
    if (parsed.legacyByColor && Object.keys(parsed.legacyByColor).length > 0) {
      const e = this.entryForColor(parsed.legacyByColor, colorRaw);
      if (e && this.entryHasAnyPrice(e)) return e;
    }
    return undefined;
  }

  private pickPriceForProcess(
    e: ColorPriceEntry,
    age: 'ADULT' | 'CHILD',
    productionProcess: 'SUBLIMATION' | 'DTF',
  ): number | undefined {
    const band = age === 'CHILD' ? 'child' : 'adult';
    const procBlock = productionProcess === 'DTF' ? e.dtf : e.sublimation;
    const n1 = procBlock?.[band];
    if (n1 !== undefined && Number.isFinite(n1) && n1 >= 0) return n1;
    const n2 = band === 'child' ? e.child : e.adult;
    if (n2 !== undefined && Number.isFinite(n2) && n2 >= 0) return n2;
    return undefined;
  }

  async getCatalogTemplates(): Promise<ProductCatalogTemplate[]> {
    const row = await this.prisma.setting.findUnique({
      where: { key: PRODUCT_CATALOG_TEMPLATES_KEY },
    });
    if (!row) return [...DEFAULT_PRODUCT_CATALOG_TEMPLATES];
    return mergeWithDefaultCatalogTemplates(
      normalizeCatalogTemplates(row.value),
    );
  }

  async saveCatalogTemplates(templates: unknown): Promise<ProductCatalogTemplate[]> {
    const normalized = normalizeCatalogTemplates(templates);
    const ids = new Set<string>();
    const codes = new Set<string>();
    for (const t of normalized) {
      if (ids.has(t.id)) {
        throw new ConflictException('IDs de modelo duplicados.');
      }
      const codeKey = t.code.trim().toUpperCase();
      if (codes.has(codeKey)) {
        throw new ConflictException(`Código de modelo duplicado: ${t.code}`);
      }
      ids.add(t.id);
      codes.add(codeKey);
      if (t.catalogFamily === 'VESTUARIO' && !t.garmentType) {
        throw new ConflictException(
          `Modelo vestuário «${t.code}» exige garmentType.`,
        );
      }
    }
    await this.prisma.setting.upsert({
      where: { key: PRODUCT_CATALOG_TEMPLATES_KEY },
      create: {
        key: PRODUCT_CATALOG_TEMPLATES_KEY,
        value: normalized as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: normalized as unknown as Prisma.InputJsonValue,
      },
    });
    return normalized;
  }
}
