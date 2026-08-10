import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminController, BackupController],
  providers: [BackupService],
})
export class AdminModule {}
