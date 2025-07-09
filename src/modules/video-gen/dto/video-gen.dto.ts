import { IsString, IsNotEmpty } from 'class-validator';

export class VideoGenDto {
  @IsString()
  @IsNotEmpty()
  narration_prompt: string;

  @IsString()
  @IsNotEmpty()
  image_url: string;
} 