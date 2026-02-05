
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { MessagingService } from './messaging.service';
import { Message, MessageCategory } from './entities/message.entity';

@Resolver(() => Message)
export class MessagingResolver {
  constructor(private readonly messagingService: MessagingService) {}

  @Mutation(() => Message)
  sendMessage(
    @Args('content') content: string,
    @Args('senderId') senderId: string,
    @Args('recipientId', { nullable: true, defaultValue: 'care-team' }) recipientId: string,
    @Args('category', { nullable: true, defaultValue: MessageCategory.GENERAL }) category: MessageCategory,
  ) {
    return this.messagingService.create(senderId, recipientId, content, category);
  }

  @Query(() => [Message], { name: 'messages' })
  findAll() {
    return this.messagingService.findAll();
  }

  @Query(() => [Message], { name: 'inbox' })
  getInbox(@Args('recipientId') recipientId: string) {
    return this.messagingService.findByRecipient(recipientId);
  }
}
