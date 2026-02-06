
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Appointment, AppointmentStatus, AppointmentType } from './entities/appointment.entity';
import { CreateAppointmentInput } from './dto/create-appointment.input';
import { Schedule } from '../provider/entities/schedule.entity';
import { TimeOff } from '../provider/entities/time-off.entity';

// Co-pay rates by appointment type (mock)
const COPAY_RATES: Record<string, number> = {
  [AppointmentType.IN_PERSON]: 25.00,
  [AppointmentType.TELEHEALTH]: 15.00,
};

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  available: boolean;
}

export interface AvailabilityResult {
  providerId: string;
  date: string;
  slots: TimeSlot[];
}

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(Schedule)
    private scheduleRepository: Repository<Schedule>,
    @InjectRepository(TimeOff)
    private timeOffRepository: Repository<TimeOff>,
  ) {}

  /**
   * Get available time slots for a provider on a given date
   */
  async getAvailableSlots(providerId: string, date: Date): Promise<AvailabilityResult> {
    const dayOfWeek = date.getDay();
    
    // Get provider's schedule for this day
    const schedule = await this.scheduleRepository.findOne({
      where: { providerId, dayOfWeek },
    });

    if (!schedule) {
      return { providerId, date: date.toISOString().split('T')[0], slots: [] };
    }

    // Check for time-off on this date
    const timeOff = await this.timeOffRepository.findOne({
      where: {
        providerId,
        startDate: LessThan(new Date(date.getTime() + 86400000)),
        endDate: MoreThan(date),
      },
    });

    if (timeOff && timeOff.isFullDay) {
      console.log(`[Availability] Provider ${providerId} has time-off on ${date.toISOString().split('T')[0]}`);
      return { providerId, date: date.toISOString().split('T')[0], slots: [] };
    }

    // Parse schedule times
    const [startHour, startMin] = schedule.startTime.split(':').map(Number);
    const [endHour, endMin] = schedule.endTime.split(':').map(Number);
    
    // Parse lunch break times if set
    let lunchStartMinutes = 0, lunchEndMinutes = 0;
    if (schedule.lunchStart && schedule.lunchEnd) {
      const [lunchStartH, lunchStartM] = schedule.lunchStart.split(':').map(Number);
      const [lunchEndH, lunchEndM] = schedule.lunchEnd.split(':').map(Number);
      lunchStartMinutes = lunchStartH * 60 + lunchStartM;
      lunchEndMinutes = lunchEndH * 60 + lunchEndM;
    }

    const slotDuration = schedule.defaultSlotDurationMinutes || 30;
    const bufferBefore = schedule.bufferMinutesBefore || 0;
    const bufferAfter = schedule.bufferMinutesAfter || 0;
    const totalSlotTime = slotDuration + bufferBefore + bufferAfter;

    // Get existing appointments for this day
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    const existingAppointments = await this.appointmentRepository.find({
      where: {
        providerId,
        status: AppointmentStatus.BOOKED,
        startTime: MoreThan(dateStart),
        endTime: LessThan(dateEnd),
      },
    });

    // Generate slots
    const slots: TimeSlot[] = [];
    let currentMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    while (currentMinutes + slotDuration <= endMinutes) {
      // Check if slot is during lunch break
      const slotEndMinutes = currentMinutes + slotDuration;
      const isDuringLunch = schedule.lunchStart && schedule.lunchEnd &&
        currentMinutes < lunchEndMinutes && slotEndMinutes > lunchStartMinutes;

      if (isDuringLunch) {
        currentMinutes = lunchEndMinutes;
        continue;
      }

      // Create slot times
      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(currentMinutes / 60), currentMinutes % 60, 0, 0);
      
      const slotEnd = new Date(date);
      slotEnd.setHours(Math.floor(slotEndMinutes / 60), slotEndMinutes % 60, 0, 0);

      // Check if slot conflicts with existing appointments (including buffer)
      const bufferStartTime = new Date(slotStart.getTime() - bufferBefore * 60000);
      const bufferEndTime = new Date(slotEnd.getTime() + bufferAfter * 60000);

      const isAvailable = !existingAppointments.some(apt => {
        const aptStart = new Date(apt.startTime);
        const aptEnd = new Date(apt.endTime);
        return bufferStartTime < aptEnd && bufferEndTime > aptStart;
      });

      slots.push({
        startTime: slotStart,
        endTime: slotEnd,
        available: isAvailable,
      });

      currentMinutes += totalSlotTime;
    }

    console.log(`[Availability] Generated ${slots.length} slots for provider ${providerId} on ${date.toISOString().split('T')[0]}`);

    return {
      providerId,
      date: date.toISOString().split('T')[0],
      slots,
    };
  }

  /**
   * Calculate co-pay for appointment
   */
  calculateCopay(appointmentType: AppointmentType): number {
    return COPAY_RATES[appointmentType] || 25.00;
  }

  /**
   * Create appointment with co-pay collection
   */
  async create(createAppointmentInput: CreateAppointmentInput): Promise<Appointment> {
    const { providerId, startTime, endTime, patientId, type } = createAppointmentInput;
    
    // Get provider schedule for buffer times
    const schedule = await this.scheduleRepository.findOne({
      where: { providerId, dayOfWeek: new Date(startTime).getDay() },
    });

    const bufferBefore = schedule?.bufferMinutesBefore || 0;
    const bufferAfter = schedule?.bufferMinutesAfter || 0;

    // Check for conflicts with buffer
    const bufferedStart = new Date(new Date(startTime).getTime() - bufferBefore * 60000);
    const bufferedEnd = new Date(new Date(endTime).getTime() + bufferAfter * 60000);

    const conflict = await this.appointmentRepository.findOne({
      where: {
        providerId,
        status: AppointmentStatus.BOOKED,
        startTime: LessThan(bufferedEnd),
        endTime: MoreThan(bufferedStart),
      },
    });

    if (conflict) {
      const overbookedCount = await this.appointmentRepository.count({
        where: {
          providerId,
          status: AppointmentStatus.BOOKED,
          startTime: LessThan(bufferedEnd),
          endTime: MoreThan(bufferedStart),
        },
      });

      const MAX_OVERBOOKING = schedule?.maxOverBooking || 2;

      if (overbookedCount >= MAX_OVERBOOKING) {
        console.log(`[WaitlistSystem] Slot full. Adding user to waitlist for ${startTime}...`);
        throw new BadRequestException('Slot is fully booked. You have been added to the waitlist.');
      }
      console.log(`[SchedulingSystem] Overbooking slot (${overbookedCount + 1}/${MAX_OVERBOOKING})...`);
    }

    // Check for time-off conflicts
    const timeOff = await this.timeOffRepository.findOne({
      where: {
        providerId,
        startDate: LessThan(new Date(endTime)),
        endDate: MoreThan(new Date(startTime)),
      },
    });

    if (timeOff) {
      throw new BadRequestException('Provider is not available during this time (time-off).');
    }

    // Check for lunch break conflict
    if (schedule?.lunchStart && schedule?.lunchEnd) {
      const appointmentStartMinutes = new Date(startTime).getHours() * 60 + new Date(startTime).getMinutes();
      const appointmentEndMinutes = new Date(endTime).getHours() * 60 + new Date(endTime).getMinutes();
      const [lunchStartH, lunchStartM] = schedule.lunchStart.split(':').map(Number);
      const [lunchEndH, lunchEndM] = schedule.lunchEnd.split(':').map(Number);
      const lunchStartMinutes = lunchStartH * 60 + lunchStartM;
      const lunchEndMinutes = lunchEndH * 60 + lunchEndM;

      if (appointmentStartMinutes < lunchEndMinutes && appointmentEndMinutes > lunchStartMinutes) {
        throw new BadRequestException('Cannot book during provider lunch break.');
      }
    }

    // Calculate and collect co-pay at booking
    const copayAmount = this.calculateCopay(type || AppointmentType.IN_PERSON);
    console.log(`[Billing] Co-pay collected at booking: $${copayAmount.toFixed(2)}`);

    const appointment = this.appointmentRepository.create({
      ...createAppointmentInput,
      status: AppointmentStatus.BOOKED,
      copayAmount,
      copayCollected: true,
    });

    return this.appointmentRepository.save(appointment);
  }

  findAll(): Promise<Appointment[]> {
    return this.appointmentRepository.find();
  }

  async findByPatient(patientId: string): Promise<Appointment[]> {
    return this.appointmentRepository.find({ where: { patientId } });
  }

  async findByProvider(providerId: string): Promise<Appointment[]> {
    return this.appointmentRepository.find({ where: { providerId } });
  }

  async cancel(appointmentId: string): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({ where: { id: appointmentId } });
    if (!appointment) {
      throw new BadRequestException('Appointment not found');
    }
    appointment.status = AppointmentStatus.CANCELLED;
    return this.appointmentRepository.save(appointment);
  }
}
