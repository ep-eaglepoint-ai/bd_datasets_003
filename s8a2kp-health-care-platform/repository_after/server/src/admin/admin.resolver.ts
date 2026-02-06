
import { Resolver, Query, ObjectType, Field } from '@nestjs/graphql';
import { AdminService } from './admin.service';
import { AdminAuditLog } from './entities/admin_audit_log.entity';

@ObjectType()
class DashboardStats {
    @Field()
    activePatients: number;
    @Field()
    upcomingAppointments: number;
    @Field()
    revenue: number;
}

@Resolver()
export class AdminResolver {
  constructor(private readonly adminService: AdminService) {}

  @Query(() => DashboardStats)
  adminStats() {
    return this.adminService.getDashboardStats();
  }

  @Query(() => [AdminAuditLog])
  auditLogs() {
    return this.adminService.getAuditLogs();
  }
}
