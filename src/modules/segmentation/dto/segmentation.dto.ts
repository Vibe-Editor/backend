import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

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
}