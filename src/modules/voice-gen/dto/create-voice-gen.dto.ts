import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';

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

  @IsNumber()
  @IsOptional()
  @Min(0.7)
  @Max(1.2)
  speed?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.0)
  @Max(1.0)
  stability?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.0)
  @Max(1.0)
  similarityBoost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.0)
  @Max(1.0)
  styleExaggeration?: number;

  @IsBoolean()
  @IsOptional()
  useSpeakerBoost?: boolean;
}
