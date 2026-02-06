
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderService } from './provider.service';
import { ProviderResolver } from './provider.resolver';
import { Provider } from './entities/provider.entity';
import { Schedule } from './entities/schedule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Provider, Schedule])],
  providers: [ProviderResolver, ProviderService],
  exports: [ProviderService],
})
export class ProviderModule {}
