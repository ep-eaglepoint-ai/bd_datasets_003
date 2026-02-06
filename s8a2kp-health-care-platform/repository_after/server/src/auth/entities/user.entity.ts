
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

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

  @Field()
  @Column({ default: false })
  mfaEnabled: boolean;

  @Column({ nullable: true })
  mfaSecret?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
