import { IsString, IsNotEmpty, IsOptional, ValidateIf, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  model: string;

  @IsString()
  @IsNotEmpty()
  gen_type: string;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'image')
  visual_prompt: string;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'video')
  animation_prompt: string;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'video')
  image_s3_key: string;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'voice')
  narration: string;

  @IsString()
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsNumber()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'voice')
  @Min(0.7)
  @Max(1.2)
  speed?: number;

  @IsNumber()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'voice')
  @Min(0.0)
  @Max(1.0)
  stability?: number;

  @IsNumber()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'voice')
  @Min(0.0)
  @Max(1.0)
  similarityBoost?: number;

  @IsNumber()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'voice')
  @Min(0.0)
  @Max(1.0)
  styleExaggeration?: number;

  @IsBoolean()
  @IsOptional()
  @ValidateIf((o) => o.gen_type === 'voice')
  useSpeakerBoost?: boolean;
}
