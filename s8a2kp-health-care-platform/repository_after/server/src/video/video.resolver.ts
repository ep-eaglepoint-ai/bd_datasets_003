
import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { VideoService } from './video.service';

@Resolver()
export class VideoResolver {
  constructor(private readonly videoService: VideoService) {}

  @Mutation(() => String)
  joinVideoRoom(
    @Args('roomName') roomName: string,
    @Args('identity') identity: string,
  ) {
    return this.videoService.generateToken(roomName, identity);
  }
}
