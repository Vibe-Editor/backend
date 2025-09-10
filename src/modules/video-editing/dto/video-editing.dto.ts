import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsUrl,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VideoReferenceDto {
  @IsString()
  @IsIn(['image'])
  type: string;

  @IsUrl()
  uri: string;
}

export class VideoEditingRequestDto {
  @IsUrl()
  videoUri: string;

  @IsString()
  promptText: string;

  @IsString()
  @IsOptional()
  model?: string = 'gen4_aleph';

  @IsString()
  @IsOptional()
  ratio?: string = '1280:720';

  @IsNumber()
  @IsOptional()
  seed?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => VideoReferenceDto)
  references?: VideoReferenceDto[];

  @IsOptional()
  contentModeration?: Record<string, any>;

  @IsString()
  @IsOptional()
  @IsIn(['auto', 'low'])
  publicFigureThreshold?: string;
}

export class VideoEditingResponseDto {
  id: string;
  status: string;
  videoUrl?: string;
  s3Key?: string;
  message?: string;
  taskId?: string;
  estimatedTime?: number;
  creditsUsed: number;
  transactionId: string;
  savedVideoId: string;
}

export class VideoEditingStatusDto {
  taskId: string;
  status: string;
  videoUrl?: string;
  s3Key?: string;
  progress?: number;
  message?: string;
}
