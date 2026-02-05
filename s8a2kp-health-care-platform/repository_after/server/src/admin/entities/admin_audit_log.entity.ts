
import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@ObjectType()
@Entity()
export class AdminAuditLog {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  action: string;

  @Field()
  @Column()
  adminId: string;

  @Field()
  @CreateDateColumn()
  timestamp: Date;

  @Field({ nullable: true })
  @Column({ nullable: true })
  details: string;
}
