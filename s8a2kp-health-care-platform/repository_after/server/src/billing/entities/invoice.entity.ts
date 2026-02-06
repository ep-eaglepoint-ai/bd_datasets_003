
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@ObjectType()
@Entity()
export class Invoice {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  appointmentId: string;

  @Field()
  @Column()
  patientId: string;

  @Field()
  @Column()
  description: string;

  @Field()
  @Column()
  amount: number;

  @Field()
  @Column({ default: 'PENDING' })
  status: string;

  @Field()
  @CreateDateColumn()
  date: Date;

  @Field({ nullable: true })
  @Column({ nullable: true })
  insuranceClaimId: string;
}
