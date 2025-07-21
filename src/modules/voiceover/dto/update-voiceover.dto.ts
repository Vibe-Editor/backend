import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateVoiceoverDto {
  @IsString()
  @IsNotEmpty()
  narration_prompt: string;

  @IsString()
  @IsOptional()
  s3_key?: string;
}
