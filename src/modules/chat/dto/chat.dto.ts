import { IsString, IsNotEmpty, IsOptional, ValidateIf } from 'class-validator';

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
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;
}
