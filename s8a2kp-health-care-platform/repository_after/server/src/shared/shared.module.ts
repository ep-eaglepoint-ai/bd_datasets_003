
import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption/encryption.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class SharedModule {}
