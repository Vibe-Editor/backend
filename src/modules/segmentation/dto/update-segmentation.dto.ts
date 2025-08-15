import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class UpdateSegmentationDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  prompt?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  concept?: string;

  @IsString()
  @IsOptional()
  negative_prompt?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['pro', 'flash'])
  model?: 'pro' | 'flash';
}
