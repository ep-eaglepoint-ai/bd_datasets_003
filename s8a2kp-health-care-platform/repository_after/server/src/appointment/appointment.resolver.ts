
import { Resolver, Query, Mutation, Args, ObjectType, Field } from '@nestjs/graphql';
import { AppointmentService, TimeSlot } from './appointment.service';
import { Appointment } from './entities/appointment.entity';
import { CreateAppointmentInput } from './dto/create-appointment.input';

@ObjectType()
class AvailableSlot {
  @Field()
  startTime: Date;

  @Field()
  endTime: Date;

  @Field()
  available: boolean;
}

@ObjectType()
class ProviderAvailability {
  @Field()
  providerId: string;

  @Field()
  date: string;

  @Field(() => [AvailableSlot])
  slots: AvailableSlot[];
}

@Resolver(() => Appointment)
export class AppointmentResolver {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Mutation(() => Appointment)
  createAppointment(@Args('createAppointmentInput') createAppointmentInput: CreateAppointmentInput) {
    return this.appointmentService.create(createAppointmentInput);
  }

  @Query(() => [Appointment], { name: 'appointments' })
  findAll() {
    return this.appointmentService.findAll();
  }

  @Query(() => [Appointment], { name: 'patientAppointments' })
  findByPatient(@Args('patientId') patientId: string) {
    return this.appointmentService.findByPatient(patientId);
  }

  @Query(() => [Appointment], { name: 'providerAppointments' })
  findByProvider(@Args('providerId') providerId: string) {
    return this.appointmentService.findByProvider(providerId);
  }

  @Query(() => ProviderAvailability, { name: 'getAvailableSlots' })
  async getAvailableSlots(
    @Args('providerId') providerId: string,
    @Args('date') date: string,
  ): Promise<ProviderAvailability> {
    const result = await this.appointmentService.getAvailableSlots(providerId, new Date(date));
    return {
      providerId: result.providerId,
      date: result.date,
      slots: result.slots.map(slot => ({
        startTime: slot.startTime,
        endTime: slot.endTime,
        available: slot.available,
      })),
    };
  }

  @Mutation(() => Appointment)
  cancelAppointment(@Args('appointmentId') appointmentId: string) {
    return this.appointmentService.cancel(appointmentId);
  }
}
