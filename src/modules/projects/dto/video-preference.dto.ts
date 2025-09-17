import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateVideoPreferencesDto {
  @IsString()
  @IsNotEmpty()
  user_prompt: string;

  @IsString()
  @IsNotEmpty()
  video_type: string;

  @IsString()
  @IsNotEmpty()
  visual_style: string;

  @IsString()
  @IsNotEmpty()
  lighting_mood: string;

  @IsString()
  @IsNotEmpty()
  camera_style: string;

  @IsString()
  @IsNotEmpty()
  subject_focus: string;

  @IsString()
  @IsNotEmpty()
  location_environment: string;
}

// dto/update-video-preferences.dto.ts

export class UpdateVideoPreferencesDto {
  @IsOptional()
  @IsString()
  user_prompt?: string;

  @IsOptional()
  @IsString()
  video_type?: string;

  @IsOptional()
  @IsString()
  visual_style?: string;

  @IsOptional()
  @IsString()
  lighting_mood?: string;

  @IsOptional()
  @IsString()
  camera_style?: string;

  @IsOptional()
  @IsString()
  subject_focus?: string;

  @IsOptional()
  @IsString()
  location_environment?: string;
}