import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  ArrayMaxSize,
} from "class-validator";

export class CreateWebhookEndpointDto {
  @IsUrl({ require_tld: false })
  url: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  subscribedEvents?: string[];
}
