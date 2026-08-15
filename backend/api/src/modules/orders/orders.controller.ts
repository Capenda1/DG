import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole, PaymentMethod } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import {
  CreateCounterOrderDto,
  QuickBalcaoClientDto,
} from './dto/create-counter-order.dto';
import { ReplaceCounterOrderItemsDto } from './dto/replace-counter-order-items.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { SaveCompositionDto } from './dto/save-composition.dto';
import { OrdersService, type MemoryUploadedFile } from './orders.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Query('take') take?: string,
    @Query('skip') skipRaw?: string,
    @Query('includeItems') includeItemsRaw?: string,
  ) {
    const n = take ? parseInt(take, 10) : 50;
    const skip = skipRaw ? parseInt(skipRaw, 10) : 0;
    const includeItems = includeItemsRaw === '1' || includeItemsRaw === 'true';
    return this.ordersService.findManyForList(
      req.user,
      Number.isFinite(n) ? n : 50,
      Number.isFinite(skip) ? skip : 0,
      { includeItems },
    );
  }

  @Get('counter/clients')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  searchCounterClients(@Query('q') q?: string) {
    return this.ordersService.searchClientsForCounter(q ?? '');
  }

  @Get('counter/drafts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  listCounterDrafts(
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.listCounterDraftSummaries(req.user);
  }

  @Get('counter/insumos')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  listCounterInsumosCatalog() {
    return this.ordersService.listCounterInsumosCatalog();
  }

  /** Grava cliente (CLIENT) na base — usado pelo registo rápido antes de criar o pedido. */
  @Post('counter/clients')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  registerCounterQuickClient(
    @Body() dto: QuickBalcaoClientDto,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.registerCounterQuickClient(dto, req.user);
  }

  @Post('counter')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  createCounter(
    @Body() dto: CreateCounterOrderDto,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.createCounterOrder(dto, req.user);
  }

  @Patch(':id/counter-items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  replaceCounterItems(
    @Param('id') id: string,
    @Body() dto: ReplaceCounterOrderItemsDto,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.replaceCounterOrderItems(id, dto, req.user);
  }

  @Patch(':id/draft-items')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CLIENT)
  replaceClientDraftItems(
    @Param('id') id: string,
    @Body() dto: ReplaceCounterOrderItemsDto,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.replaceClientDraftOrderItems(id, dto, req.user);
  }

  @Post()
  create(
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createDraftForClient(req.user.id, dto, req.user);
  }

  @Get(':id/modelagem/files')
  listModelagemFiles(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.listModelagemFiles(id, req.user);
  }

  @Post(':id/modelagem/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  uploadModelagemFile(
    @Param('id') id: string,
    @UploadedFile() file: MemoryUploadedFile | undefined,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Envia um ficheiro no campo file.');
    }
    return this.ordersService.uploadModelagemFile(id, file, req.user);
  }

  @Post(':id/modelagem/composition')
  saveComposition(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() dto: SaveCompositionDto,
  ) {
    return this.ordersService.saveModelagemComposition(id, dto, req.user);
  }

  @Patch(':id/modelagem/specs')
  updateModelagemSpecs(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: unknown,
  ) {
    return this.ordersService.updateModelagemSpecs(id, body, req.user);
  }

  /** Última composição PNG guardada no editor de modelagem (última `ArtVersion`). */
  @Get(':id/modelagem/art/latest')
  async getLatestArtVersion(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ): Promise<StreamableFile> {
    const { stream, mimeType, downloadName } =
      await this.ordersService.getLatestArtVersionStream(id, req.user);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `inline; filename="${encodeURIComponent(downloadName)}"`,
    });
  }

  @Get(':id/modelagem/files/:fileId')
  async getModelagemFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ): Promise<StreamableFile> {
    const { stream, mimeType, downloadName } =
      await this.ordersService.getModelagemFileStream(id, fileId, req.user);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `inline; filename="${encodeURIComponent(downloadName)}"`,
    });
  }

  @Delete(':id/modelagem/files/:fileId')
  deleteModelagemFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.deleteModelagemFile(id, fileId, req.user);
  }

  /** Próximos estados permitidos para o utilizador autenticado (fonte única para a UI). */
  @Get(':id/allowed-transitions')
  getAllowedTransitions(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.getAllowedNextStatuses(id, req.user);
  }

  /** Comprovativo de pagamento (PNG/JPEG/PDF) enviado pelo cliente no submit. */
  @Get(':id/payment-proof')
  async getPaymentProof(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ): Promise<StreamableFile> {
    const { stream, mimeType, downloadName } =
      await this.ordersService.getPaymentProofStream(id, req.user);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `inline; filename="${encodeURIComponent(downloadName)}"`,
    });
  }

  /** Designer reclama pedido sem `designerId` na fila criativa ou rascunho de balcão partilhado pelo PDV. */
  @Post(':id/claim-designer')
  claimDesigner(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.claimOrderAsDesigner(id, req.user);
  }

  /**
   * Rascunho de balcão: torna o pedido visível aos designers (antes do pagamento).
   * Só ADMIN / ATTENDANT; o atendente só nos rascunhos que criou.
   */
  @Post(':id/share-draft-with-design-team')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  shareDraftWithDesignTeam(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.shareBalcaoDraftWithDesignTeam(id, req.user);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.findOneForUser(id, req.user);
  }

  /** Admin define o valor total do pedido (em Kwanzas). */
  @Patch(':id/price')
  setOrderPrice(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: { totalAmount: number; notes?: string },
  ) {
    return this.ordersService.setOrderPrice(
      id,
      body.totalAmount,
      body.notes,
      req.user,
    );
  }

  /**
   * Altera o estado do pedido (designer, produção, admin, ou cliente nas transições permitidas).
   * Ninguém pode passar de DRAFT para SUBMITTED por aqui — apenas `POST :id/submit`
   * (método de pagamento + comprovativo quando aplicável).
   */
  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() dto: ChangeOrderStatusDto,
  ) {
    return this.ordersService.changeStatus(
      id,
      dto.status,
      req.user,
      dto.paymentMethod,
      dto.cancellationReason,
    );
  }

  /** Reverte o cancelamento, incluindo stock e lançamento financeiro compensatório. */
  @Post(':id/reopen')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  reopenCancelledOrder(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body() body: { reason?: string },
  ) {
    return this.ordersService.reopenCancelledOrder(id, req.user, body.reason);
  }

  @Delete(':id')
  deleteOrder(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string; role: UserRole } },
  ) {
    return this.ordersService.deleteOrder(id, req.user);
  }

  /**
   * Único endpoint para o cliente submeter um pedido em rascunho (DRAFT → SUBMITTED).
   * Corpo multipart: `paymentMethod` (obrigatório), `proof` (opcional, PNG/JPEG/PDF)
   * e `discountAmount` (opcional, só staff em pedido de balcão).
   */
  @Post(':id/submit')
  @UseInterceptors(
    FileInterceptor('proof', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  submitOrderWithProof(
    @Param('id') id: string,
    @UploadedFile() proof: MemoryUploadedFile | undefined,
    @Req() req: Request & { user: { id: string; role: UserRole } },
    @Body('paymentMethod') paymentMethod: string,
    @Body('discountAmount') discountAmountRaw?: string,
    @Body('notes') notesRaw?: string,
    @Body('receptionDate') receptionDateRaw?: string,
  ) {
    if (
      !Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)
    ) {
      throw new BadRequestException('Método de pagamento inválido.');
    }
    let discountForSubmit: number | undefined;
    if (
      discountAmountRaw !== undefined &&
      discountAmountRaw !== null &&
      String(discountAmountRaw).trim() !== ''
    ) {
      if (req.user.role === UserRole.CLIENT) {
        throw new BadRequestException(
          'Apenas o balcão pode indicar desconto na submissão.',
        );
      }
      const n = parseFloat(String(discountAmountRaw).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) {
        throw new BadRequestException('Desconto inválido.');
      }
      discountForSubmit = Math.round(n * 100) / 100;
    }
    const staffSubmit =
      req.user.role === UserRole.ADMIN || req.user.role === UserRole.ATTENDANT;
    let notesForSubmit: string | undefined;
    let receptionDateForSubmit: string | undefined;
    if (staffSubmit) {
      if (notesRaw !== undefined) {
        notesForSubmit = String(notesRaw);
      }
      if (receptionDateRaw !== undefined) {
        receptionDateForSubmit = String(receptionDateRaw);
      }
    } else if (
      (notesRaw !== undefined && String(notesRaw).trim() !== '') ||
      (receptionDateRaw !== undefined && String(receptionDateRaw).trim() !== '')
    ) {
      throw new BadRequestException(
        'Apenas o balcão pode indicar descrição ou data de recepção na submissão.',
      );
    }

    return this.ordersService.submitOrderWithProof(
      id,
      paymentMethod as PaymentMethod,
      proof,
      req.user,
      discountForSubmit,
      notesForSubmit,
      receptionDateForSubmit,
    );
  }
}
