
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module';
import { ProviderModule } from './provider/provider.module';
import { AppointmentModule } from './appointment/appointment.module';
import { VideoModule } from './video/video.module';
import { PrescriptionModule } from './prescription/prescription.module';
import { MedicalRecordModule } from './medical-record/medical-record.module';
import { MessagingModule } from './messaging/messaging.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';
import { SharedModule } from './shared/shared.module';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/healthcare',
      autoLoadEntities: true,
      synchronize: true,
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      playground: false,
    }),
    SharedModule,
    AuthModule,
    PatientModule,
    ProviderModule,
    AppointmentModule,
    VideoModule,
    PrescriptionModule,
    MedicalRecordModule,
    MessagingModule,
    BillingModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
