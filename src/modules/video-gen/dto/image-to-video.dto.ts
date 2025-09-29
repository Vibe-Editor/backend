import { IsString, IsNotEmpty, IsOptional, IsIn, IsBoolean } from 'class-validator';

export class ImageToVideoDto {
  @IsString()
  @IsNotEmpty()
  imageS3Key: string;

  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  @IsIn(['8s'])
  duration?: string = '8s';

  @IsString()
  @IsOptional()
  @IsIn(['auto', '16:9', '9:16'])
  aspect_ratio?: string = '16:9';

  @IsString()
  @IsOptional()
  @IsIn(['720p', '1080p'])
  resolution?: string = '720p';

  @IsBoolean()
  @IsOptional()
  generate_audio?: boolean = true;

  @IsString()
  @IsOptional()
  projectId?: string;
}
