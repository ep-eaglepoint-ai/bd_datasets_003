
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { MessagingService } from './messaging.service';
import { Message } from './entities/message.entity';

@Resolver(() => Message)
export class MessagingResolver {
  constructor(private readonly messagingService: MessagingService) {}

  @Mutation(() => Message)
  sendMessage(
    @Args('content') content: string,
    @Args('senderId') senderId: string,
  ) {
    return this.messagingService.create(senderId, content);
  }

  @Query(() => [Message], { name: 'messages' })
  findAll() {
    return this.messagingService.findAll();
  }
}
