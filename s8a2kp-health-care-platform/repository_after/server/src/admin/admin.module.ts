
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog } from './entities/admin_audit_log.entity';
import { AdminService } from './admin.service';
import { AdminResolver } from './admin.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog])],
  providers: [AdminService, AdminResolver],
  exports: [AdminService],
})
export class AdminModule {}
