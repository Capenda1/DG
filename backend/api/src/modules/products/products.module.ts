import { Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { CatalogController } from './catalog.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [CatalogController, AdminProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
