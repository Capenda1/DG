import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { RhController } from './rh.controller';
import { RhService } from './rh.service';

@Module({
  imports: [FinanceModule],
  controllers: [RhController],
  providers: [RhService],
  exports: [RhService],
})
export class RhModule {}
