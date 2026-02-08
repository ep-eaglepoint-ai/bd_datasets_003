import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { TenantService } from './tenant.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  async create(@Body('name') name: string) {
    return this.tenantService.create(name);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.tenantService.findById(id);
  }
}
