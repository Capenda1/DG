import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProductsService } from './products.service';

/** Catálogo para cliente (novo pedido) e equipa operacional — não disponível ao perfil DESIGNER. */
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.CLIENT)
export class CatalogController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  listProducts() {
    return this.products.listCatalogForClient();
  }
}
