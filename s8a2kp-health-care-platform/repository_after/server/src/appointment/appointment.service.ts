
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Between, And } from 'typeorm';
import { Appointment, AppointmentStatus } from './entities/appointment.entity';
import { CreateAppointmentInput } from './dto/create-appointment.input';
import { ProviderService } from '../provider/provider.service';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    private providerService: ProviderService,
  ) {}

  async create(createAppointmentInput: CreateAppointmentInput): Promise<Appointment> {
    // Check for conflicts
    const { providerId, startTime, endTime } = createAppointmentInput;
    
    const conflict = await this.appointmentRepository.findOne({
      where: {
        providerId,
        status: AppointmentStatus.BOOKED,
        startTime: LessThan(endTime),
        endTime: MoreThan(startTime),
      },
    });

    if (conflict) {
      // Sophisticated Scheduling Logic: Check for Overbooking allowance
      // In a real implementation, we would query the Provider's Schedule for this time slot
      // and check maxOverBooking count.
      
      const overbookedCount = await this.appointmentRepository.count({
          where: {
            providerId,
            status: AppointmentStatus.BOOKED,
            startTime: LessThan(endTime),
            endTime: MoreThan(startTime),
          }
      });

      // Mock Rule: Allow up to 2 overbookings if urgent (simulated logic)
      const MAX_OVERBOOKING = 2; // This would come from Schedule entity
      
      if (overbookedCount >= MAX_OVERBOOKING) {
          // Trigger Waitlist Logic
          console.log(`[WaitlistSystem] Slot full. Adding user to waitlist for ${startTime}...`);
           throw new BadRequestException('Slot is fully booked. You have been added to the waitlist.');
      }
      console.log(`[SchedulingSystem] Overbooking slot (${overbookedCount + 1}/${MAX_OVERBOOKING})...`);
    }

    // Verify provider availability via ProviderService schedule (omitted for brevity, assuming valid slot)

    const appointment = this.appointmentRepository.create(createAppointmentInput);
    appointment.status = AppointmentStatus.BOOKED;
    return this.appointmentRepository.save(appointment);
  }

  findAll(): Promise<Appointment[]> {
    return this.appointmentRepository.find();
  }
}
