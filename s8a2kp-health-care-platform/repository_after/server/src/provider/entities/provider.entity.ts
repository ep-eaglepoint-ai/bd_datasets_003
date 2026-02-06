
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Schedule } from './schedule.entity';

@ObjectType()
@Entity()
export class Provider {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  name: string;

  @Field()
  @Column()
  specialty: string;

  @Field(() => [Schedule], { nullable: 'items' })
  @OneToMany(() => Schedule, schedule => schedule.provider)
  schedules: Schedule[];
}
