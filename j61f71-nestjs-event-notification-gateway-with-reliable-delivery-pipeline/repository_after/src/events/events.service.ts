import { Injectable, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantService } from '../tenant/tenant.service';

export interface AppEvent {
  id: string;
  type: string;
  tenantId: string;
  payload: Record<string, any>;
  occurredAt: Date;
}

@Injectable()
export class EventsService {
  constructor(
    private eventEmitter: EventEmitter2,
    private tenantService: TenantService,
  ) {}

  async emit(type: string, tenantId: string, payload: Record<string, any>): Promise<AppEvent> {
    const withinLimit = await this.tenantService.checkEventLimit(tenantId);
    if (!withinLimit) {
      throw new ForbiddenException('Monthly event limit exceeded');
    }

    const event: AppEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      tenantId,
      payload,
      occurredAt: new Date(),
    };

    await this.tenantService.incrementEventCount(tenantId);

    this.eventEmitter.emit('app.event', event);
    this.eventEmitter.emit(`app.event.${type}`, event);

    return event;
  }
}
