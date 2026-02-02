
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@ObjectType()
@Entity()
export class Prescription {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  patientId: string;

  @Field()
  @Column()
  providerId: string;

  @Field()
  @Column()
  medicationName: string;

  @Field()
  @Column()
  dosage: string;

  @Field()
  @Column({ default: 'PENDING' })
  status: string;
}
