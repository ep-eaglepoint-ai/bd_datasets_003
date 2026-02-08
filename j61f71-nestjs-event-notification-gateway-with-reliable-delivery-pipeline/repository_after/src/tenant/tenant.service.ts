import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant } from './schemas/tenant.schema';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TenantService {
  constructor(@InjectModel(Tenant.name) private tenantModel: Model<Tenant>) {}

  async create(name: string): Promise<Tenant> {
    const tenant = new this.tenantModel({
      name,
      apiKey: `tk_${uuidv4().replace(/-/g, '')}`,
    });
    return tenant.save();
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantModel.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    return this.tenantModel.findOne({ apiKey, isActive: true });
  }

  async incrementEventCount(tenantId: string): Promise<void> {
    await this.tenantModel.findByIdAndUpdate(tenantId, {
      $inc: { eventsThisMonth: 1 },
    });
  }

  async checkEventLimit(tenantId: string): Promise<boolean> {
    const tenant = await this.findById(tenantId);
    return tenant.eventsThisMonth < tenant.monthlyEventLimit;
  }
}
