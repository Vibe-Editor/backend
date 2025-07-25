import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class UpdateVideoGenDto {
  @IsString()
  @IsNotEmpty()
  animation_prompt: string;

  @IsString()
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsOptional()
  image_s3_key?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  video_s3_keys?: string[];

  @IsString()
  @IsOptional()
  projectId?: string;
}
