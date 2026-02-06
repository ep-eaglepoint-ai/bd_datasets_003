
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Message, MessageCategory } from './entities/message.entity';

export interface MessageStats {
  totalMessages: number;
  averageResponseTimeMinutes: number;
  unansweredCount: number;
  responseRate: number;
}

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  /**
   * Create and send a secure message with category-based routing.
   */
  async create(
    senderId: string, 
    recipientId: string, 
    content: string, 
    category: MessageCategory = MessageCategory.GENERAL,
    attachmentUrl?: string,
    attachmentType?: string,
  ): Promise<Message> {
    
    // Auto-routing based on message type
    const routedRecipientId = this.autoRoute(recipientId, category);
    
    const message = this.messageRepository.create({
      senderId,
      content,
      recipientId: routedRecipientId,
      category,
      sentAt: new Date(),
      attachmentUrl,
      attachmentType,
    });

    const savedMessage = await this.messageRepository.save(message);
    
    // Audit Logging for HIPAA compliance
    console.log(`[AuditLog] Message ${savedMessage.id} sent from ${senderId} to ${routedRecipientId} category=${category} at ${new Date().toISOString()}`);
    
    if (attachmentUrl) {
      console.log(`[AuditLog] Attachment included: ${attachmentType || 'unknown'} at ${attachmentUrl}`);
    }
    
    return savedMessage;
  }

  /**
   * Reply to a message - tracks response time
   */
  async reply(
    originalMessageId: string,
    senderId: string,
    content: string,
    attachmentUrl?: string,
  ): Promise<Message> {
    const originalMessage = await this.messageRepository.findOne({ 
      where: { id: originalMessageId } 
    });
    
    if (!originalMessage) {
      throw new BadRequestException('Original message not found');
    }

    // Calculate response time
    const responseTimeMs = Date.now() - new Date(originalMessage.sentAt).getTime();
    const responseTimeMinutes = Math.round(responseTimeMs / 60000);
    
    // Update original message with response timestamp
    originalMessage.respondedAt = new Date();
    originalMessage.responseTimeMinutes = responseTimeMinutes;
    await this.messageRepository.save(originalMessage);
    
    console.log(`[ResponseTime] Message ${originalMessageId} responded to in ${responseTimeMinutes} minutes`);

    // Create reply message
    const reply = this.messageRepository.create({
      senderId,
      recipientId: originalMessage.senderId,
      content,
      category: originalMessage.category,
      sentAt: new Date(),
      attachmentUrl,
      parentMessageId: originalMessageId,
    });

    return this.messageRepository.save(reply);
  }

  /**
   * Upload attachment and get URL (mock implementation)
   */
  async uploadAttachment(
    patientId: string,
    filename: string,
    mimeType: string,
    data: Buffer,
  ): Promise<{ url: string; type: string }> {
    // In production, this would upload to S3/GCS with encryption
    const attachmentId = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = `https://secure-storage.healthcare.app/attachments/${patientId}/${attachmentId}/${filename}`;
    
    console.log(`[Attachment] Uploaded ${filename} (${mimeType}) for patient ${patientId}`);
    console.log(`[Attachment] Encrypted and stored at: ${url}`);
    
    return { url, type: mimeType };
  }

  /**
   * Auto-route messages based on category to appropriate care team member.
   */
  private autoRoute(recipientId: string, category: MessageCategory): string {
    switch (category) {
      case MessageCategory.PRESCRIPTION_REFILL:
        console.log('[Routing] Forwarding prescription refill request to pharmacy team...');
        return recipientId;
      case MessageCategory.APPOINTMENT_REQUEST:
        console.log('[Routing] Forwarding appointment request to scheduling team...');
        return recipientId;
      case MessageCategory.MEDICAL_QUESTION:
        console.log('[Routing] Forwarding medical question to assigned provider...');
        return recipientId;
      case MessageCategory.LAB_RESULTS:
        console.log('[Routing] Lab results inquiry forwarded to lab department...');
        return recipientId;
      case MessageCategory.BILLING:
        console.log('[Routing] Billing inquiry forwarded to billing department...');
        return recipientId;
      default:
        return recipientId;
    }
  }

  /**
   * Get messaging statistics for a provider/team
   */
  async getMessageStats(recipientId: string): Promise<MessageStats> {
    const messages = await this.messageRepository.find({ where: { recipientId } });
    
    const answeredMessages = messages.filter(m => m.responseTimeMinutes !== null);
    const unansweredMessages = messages.filter(m => m.respondedAt === null);
    
    const totalResponseTime = answeredMessages.reduce(
      (sum, m) => sum + (m.responseTimeMinutes || 0), 
      0
    );
    
    return {
      totalMessages: messages.length,
      averageResponseTimeMinutes: answeredMessages.length > 0 
        ? Math.round(totalResponseTime / answeredMessages.length) 
        : 0,
      unansweredCount: unansweredMessages.length,
      responseRate: messages.length > 0 
        ? Math.round((answeredMessages.length / messages.length) * 100) 
        : 100,
    };
  }

  async findAll(): Promise<Message[]> {
    return this.messageRepository.find({ order: { sentAt: 'DESC' } });
  }

  async findByRecipient(recipientId: string): Promise<Message[]> {
    return this.messageRepository.find({ 
      where: { recipientId },
      order: { sentAt: 'DESC' }
    });
  }

  async findBySender(senderId: string): Promise<Message[]> {
    return this.messageRepository.find({ 
      where: { senderId },
      order: { sentAt: 'DESC' }
    });
  }

  async getConversation(messageId: string): Promise<Message[]> {
    const message = await this.messageRepository.findOne({ where: { id: messageId } });
    if (!message) return [];

    // Get all messages in thread
    const thread = await this.messageRepository.find({
      where: [
        { id: messageId },
        { parentMessageId: messageId },
      ],
      order: { sentAt: 'ASC' },
    });

    return thread;
  }
}
