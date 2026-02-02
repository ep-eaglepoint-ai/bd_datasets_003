
import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ProviderService } from './provider.service';
import { Provider } from './entities/provider.entity';
import { Schedule } from './entities/schedule.entity';
import { CreateProviderInput, AddScheduleInput } from './dto/provider.input';

@Resolver(() => Provider)
export class ProviderResolver {
  constructor(private readonly providerService: ProviderService) {}

  @Mutation(() => Provider)
  createProvider(@Args('createProviderInput') createProviderInput: CreateProviderInput) {
    return this.providerService.create(createProviderInput);
  }

  @Mutation(() => Schedule)
  addSchedule(@Args('addScheduleInput') addScheduleInput: AddScheduleInput) {
    return this.providerService.addSchedule(addScheduleInput);
  }

  @Query(() => [Provider], { name: 'providers' })
  findAll() {
    return this.providerService.findAll();
  }

  @Query(() => Provider, { name: 'provider' })
  findOne(@Args('id', { type: () => ID }) id: string) {
    return this.providerService.findOne(id);
  }
}
