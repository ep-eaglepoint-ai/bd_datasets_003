
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  async create(senderId: string, content: string): Promise<Message> {
      // Logic would be here to handle message encryption before saving
      // assuming encryption transformer handles it in the entity
      const message = this.messageRepository.create({
          senderId,
          content,
          recipientId: '1', // Mock recipient
          category: 'GENERAL'
      });
      return this.messageRepository.save(message);
  }

  async findAll(): Promise<Message[]> {
    return this.messageRepository.find();
  }
}
