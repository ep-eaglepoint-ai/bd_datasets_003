
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToOne } from 'typeorm';
import { EncryptionTransformer } from '../../shared/encryption/encryption.transformer';

@ObjectType()
@Entity()
export class Patient {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  email: string;

  @Field()
  @Column()
  firstName: string;

  @Field()
  @Column()
  lastName: string;

  @Field()
  @Column({ default: false })
  isVerified: boolean;

  @Field({ nullable: true })
  @Column({ nullable: true })
  docScanUrl: string; // Mock URL for uploaded ID document

  @Field({ nullable: true })
  @Column({ transformer: EncryptionTransformer, type: 'text', nullable: true })
  insuranceProvider: string;

  @Field({ nullable: true })
  @Column({ transformer: EncryptionTransformer, type: 'text', nullable: true })
  insurancePolicyNumber: string;

  @Field()
  @Column({ transformer: EncryptionTransformer, type: 'text', nullable: true })
  insuranceData: string; // Additional JSON details

  @Field({ nullable: true })
  @Column({ transformer: EncryptionTransformer, type: 'text', nullable: true })
  medicalHistory: string; // JSON string or reference to records

  @Field(() => [Patient], { nullable: 'items' })
  @OneToMany(() => Patient, patient => patient.guardian)
  dependents: Patient[];

  @Field(() => Patient, { nullable: true })
  @ManyToOne(() => Patient, patient => patient.dependents, { nullable: true })
  guardian: Patient;

  @Field({ nullable: true })
  @Column({ nullable: true })
  consentSignature: string; // Base64 or ID
}
