import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [EventEmitterModule.forRoot(), TenantModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
