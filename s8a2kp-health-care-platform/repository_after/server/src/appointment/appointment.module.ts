
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentService } from './appointment.service';
import { AppointmentResolver } from './appointment.resolver';
import { Appointment } from './entities/appointment.entity';
import { Schedule } from '../provider/entities/schedule.entity';
import { TimeOff } from '../provider/entities/time-off.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Schedule, TimeOff])],
  providers: [AppointmentResolver, AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
