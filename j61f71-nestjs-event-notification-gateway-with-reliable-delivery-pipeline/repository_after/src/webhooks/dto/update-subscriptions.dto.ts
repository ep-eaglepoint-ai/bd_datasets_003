import { IsArray, IsString, ArrayMaxSize } from "class-validator";

export class UpdateWebhookSubscriptionsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  subscribedEvents: string[];
}
