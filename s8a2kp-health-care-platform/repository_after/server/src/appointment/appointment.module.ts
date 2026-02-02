
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentService } from './appointment.service';
import { AppointmentResolver } from './appointment.resolver';
import { Appointment } from './entities/appointment.entity';
import { ProviderModule } from '../provider/provider.module';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment]), ProviderModule],
  providers: [AppointmentResolver, AppointmentService],
})
export class AppointmentModule {}
