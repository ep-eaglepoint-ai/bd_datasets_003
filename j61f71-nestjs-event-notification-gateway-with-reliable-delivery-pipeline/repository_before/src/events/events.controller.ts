import { Controller, Post, Body, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { EventsService } from './events.service';
import { TenantService } from '../tenant/tenant.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly tenantService: TenantService,
  ) {}

  @Post(':eventType')
  async emit(
    @Headers('x-api-key') apiKey: string,
    @Param('eventType') eventType: string,
    @Body() payload: Record<string, any>,
  ) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    const tenant = await this.tenantService.findByApiKey(apiKey);
    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }

    const event = await this.eventsService.emit(eventType, tenant._id.toString(), payload);
    return { success: true, eventId: event.id, eventType };
  }
}
