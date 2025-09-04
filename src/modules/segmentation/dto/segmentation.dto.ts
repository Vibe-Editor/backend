import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class SegmentationDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsNotEmpty()
  concept: string;

  @IsString()
  @IsOptional()
  negative_prompt: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['pro', 'flash', 'openai'])
  model: 'pro' | 'flash' | 'openai';
}
