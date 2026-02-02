
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { EncryptionTransformer } from '../../shared/encryption/encryption.transformer';

@ObjectType()
@Entity()
export class MedicalRecord {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  patientId: string;

  @Field()
  @Column()
  recordType: string; // LAB, IMAGING, VISIT_SUMMARY

  @Field()
  @Column({ transformer: EncryptionTransformer, type: 'text' })
  data: string; // Encrypted JSON content
  
  @Field()
  @Column()
  date: Date;
}
