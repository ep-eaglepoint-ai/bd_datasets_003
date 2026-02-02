
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@ObjectType()
@Entity()
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  email: string;

  @Column() // Hashed password
  passwordHash: string;

  @Field()
  @Column()
  role: string; // PATIENT, PROVIDER, ADMIN

  @Column({ nullable: true })
  mfaSecret: string;
}
