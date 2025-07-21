import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateVideoGenDto {
  @IsString()
  @IsNotEmpty()
  animation_prompt: string;

  @IsString()
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsOptional()
  imageS3Key?: string;
}
