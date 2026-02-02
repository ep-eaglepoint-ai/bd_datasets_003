
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from './entities/provider.entity';
import { Schedule } from './entities/schedule.entity';
import { CreateProviderInput, AddScheduleInput } from './dto/provider.input';

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(Provider)
    private providerRepository: Repository<Provider>,
    @InjectRepository(Schedule)
    private scheduleRepository: Repository<Schedule>,
  ) {}

  create(createProviderInput: CreateProviderInput): Promise<Provider> {
    const provider = this.providerRepository.create(createProviderInput);
    return this.providerRepository.save(provider);
  }

  findAll(): Promise<Provider[]> {
    return this.providerRepository.find({ relations: ['schedules'] });
  }

  async findOne(id: string): Promise<Provider> {
    const provider = await this.providerRepository.findOne({ where: { id }, relations: ['schedules'] });
    if (!provider) throw new Error('Provider not found');
    return provider;
  }

  async addSchedule(addScheduleInput: AddScheduleInput): Promise<Schedule> {
    const schedule = this.scheduleRepository.create(addScheduleInput);
    return this.scheduleRepository.save(schedule);
  }
}
