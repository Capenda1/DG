import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CatalogFamily, ProductStatus, UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BulkCreateVariantsDto } from './dto/bulk-create-variants.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-variant.dto';
import { SaveCatalogTemplatesDto } from './dto/save-catalog-templates.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-variant.dto';
import { ProductsService } from './products.service';

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('catalog/templates')
  listCatalogTemplates() {
    return this.products.getCatalogTemplates();
  }

  @Put('catalog/templates')
  saveCatalogTemplates(@Body() dto: SaveCatalogTemplatesDto) {
    return this.products.saveCatalogTemplates(dto.templates);
  }

  @Get()
  list(
    @Query('q') q?: string,
    @Query('take') takeRaw?: string,
    @Query('skip') skipRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('catalogLine') catalogLineRaw?: string,
    @Query('catalogFamily') catalogFamilyRaw?: string,
  ) {
    const take = takeRaw !== undefined ? parseInt(takeRaw, 10) : undefined;
    const skip = skipRaw !== undefined ? parseInt(skipRaw, 10) : undefined;
    const status =
      statusRaw === ProductStatus.ACTIVE ||
      statusRaw === ProductStatus.INACTIVE ||
      statusRaw === ProductStatus.ARCHIVED
        ? statusRaw
        : undefined;
    const catalogLine =
      catalogLineRaw === 'APPAREL' || catalogLineRaw === 'GENERIC'
        ? catalogLineRaw
        : undefined;
    const catalogFamily =
      catalogFamilyRaw === CatalogFamily.VESTUARIO ||
      catalogFamilyRaw === CatalogFamily.CANECA ||
      catalogFamilyRaw === CatalogFamily.IMPRESSAO_PLANA ||
      catalogFamilyRaw === CatalogFamily.SERVICO ||
      catalogFamilyRaw === CatalogFamily.GENERICO
        ? catalogFamilyRaw
        : undefined;
    return this.products.listForAdmin({
      q: q?.trim() ? q.trim() : undefined,
      take: Number.isFinite(take) ? take : undefined,
      skip: Number.isFinite(skip) ? skip : undefined,
      status,
      catalogLine,
      catalogFamily,
    });
  }

  @Get(':productId')
  getOne(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.products.findOneForAdmin(productId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createProduct(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  @Patch(':productId')
  updateProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.updateProduct(productId, dto);
  }

  @Delete(':productId/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVariant(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return this.products.deleteVariant(productId, variantId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProduct(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.products.deleteProduct(productId);
  }

  @Post(':productId/variants/batch')
  batchCreateVariants(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: BulkCreateVariantsDto,
  ) {
    return this.products.createVariantsBatch(productId, dto.variants);
  }

  @Post(':productId/variants')
  @HttpCode(HttpStatus.CREATED)
  createVariant(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.products.createVariant(productId, dto);
  }

  @Patch(':productId/variants/:variantId')
  updateVariant(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.products.updateVariant(productId, variantId, dto);
  }
}
