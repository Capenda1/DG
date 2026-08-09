import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { InsumosService } from './insumos.service';
import {
  AddInsumoCatalogItemDto,
  CreateConsumoDto,
  CreateInsumoDto,
  CreateMovimentoDto,
  UpdateInsumoDto,
} from './dto/insumos.dto';
import type { SessionUser } from '../auth/types/session-user.type';

/**
 * Ordem das rotas: paths estáticos (dashboard, consumos/…) ANTES de `:id`,
 * senão o Nest captura "consumos" como UUID.
 */
@Controller('insumos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class InsumosController {
  constructor(private readonly service: InsumosService) {}

  @Get('dashboard')
  dashboard() {
    return this.service.getDashboard();
  }

  /** Estático antes de `@Get(':id')`, senão `catalog-lists` é tratado como UUID (500 no Prisma). */
  @Get('catalog-lists')
  catalogLists() {
    return this.service.getInsumoCatalogLists();
  }

  @Post('catalog-lists/items')
  @Roles(UserRole.ADMIN)
  addCatalogItem(@Body() dto: AddInsumoCatalogItemDto) {
    return this.service.addInsumoCatalogItem(dto.kind, dto.value);
  }

  @Get('consumos/list')
  listConsumos() {
    return this.service.listConsumos();
  }

  @Post('consumos')
  @Roles(UserRole.ADMIN)
  createConsumo(@Body() dto: CreateConsumoDto) {
    return this.service.createConsumo(dto);
  }

  @Delete('consumos/:consumoId')
  @Roles(UserRole.ADMIN)
  deleteConsumo(@Param('consumoId') consumoId: string) {
    return this.service.deleteConsumo(consumoId);
  }

  @Get()
  list(@Query('all') all?: string) {
    return this.service.listInsumos(all === '1');
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateInsumoDto) {
    return this.service.createInsumo(dto);
  }

  @Get(':id/movimentos')
  listMovimentos(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listMovimentos(id, limit ? parseInt(limit, 10) : 100);
  }

  @Post(':id/movimentos')
  @Roles(UserRole.ADMIN)
  addMovimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMovimentoDto,
    @Req() req: { user: SessionUser },
  ) {
    return this.service.addMovimento(id, dto, req.user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getInsumo(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInsumoDto) {
    return this.service.updateInsumo(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteInsumo(id);
  }
}
