import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateVoiceGenDto {
  @IsString()
  @IsNotEmpty()
  narration: string;

  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsOptional()
  voiceId?: string;

  @IsString()
  @IsOptional()
  modelId?: string;

  @IsBoolean()
  @IsOptional()
  isEditCall?: boolean;
}
