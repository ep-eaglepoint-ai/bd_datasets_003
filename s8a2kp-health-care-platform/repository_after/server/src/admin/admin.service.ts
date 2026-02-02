
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog } from './entities/admin_audit_log.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private auditRepository: Repository<AdminAuditLog>,
  ) {}

  async getDashboardStats() {
    return {
        activePatients: 150, // Mocked for now, or inject other services to count
        upcomingAppointments: 45,
        revenue: 12500.00
    };
  }

  async getAuditLogs(): Promise<AdminAuditLog[]> {
    return this.auditRepository.find({ order: { timestamp: 'DESC' }, take: 20 });
  }
}
