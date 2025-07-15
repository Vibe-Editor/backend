import { IsString, IsNotEmpty } from 'class-validator';

export class SegmentationDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsNotEmpty()
  concept: string;

  @IsString()
  @IsNotEmpty()
  negative_prompt: string;
}