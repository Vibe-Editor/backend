import { IsString, IsIn, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateVideoPreferencesDto {
  @IsString()
  @IsNotEmpty()
  user_prompt: string;

  @IsString()
  @IsIn(['product_showcase', 'talking_head', 'third_person_ad', 'project_explainer'])
  video_type: string;

  @IsString()
  @IsIn(['luxury_premium', 'clean_minimal', 'warm_natural', 'futuristic_tech'])
  visual_style: string;

  @IsString()
  @IsIn(['dramatic_cinematic', 'bright_professional', 'golden_hour', 'studio_controlled'])
  lighting_mood: string;

  @IsString()
  @IsIn(['smooth_cinematic', 'dynamic_engaging', 'steady_professional', 'product_focused'])
  camera_style: string;

  @IsString()
  @IsIn(['person_speaking', 'product_showcase', 'lifestyle_scene', 'abstract_concept'])
  subject_focus: string;

  @IsString()
  @IsIn(['studio_minimal', 'office_professional', 'lifestyle_natural', 'luxury_premium'])
  location_environment: string;
}

// dto/update-video-preferences.dto.ts

export class UpdateVideoPreferencesDto {
  @IsOptional()
  @IsString()
  user_prompt?: string;

  @IsOptional()
  @IsString()
  @IsIn(['product_showcase', 'talking_head', 'third_person_ad', 'project_explainer'])
  video_type?: string;

  @IsOptional()
  @IsString()
  @IsIn(['luxury_premium', 'clean_minimal', 'warm_natural', 'futuristic_tech'])
  visual_style?: string;

  @IsOptional()
  @IsString()
  @IsIn(['dramatic_cinematic', 'bright_professional', 'golden_hour', 'studio_controlled'])
  lighting_mood?: string;

  @IsOptional()
  @IsString()
  @IsIn(['smooth_cinematic', 'dynamic_engaging', 'steady_professional', 'product_focused'])
  camera_style?: string;

  @IsOptional()
  @IsString()
  @IsIn(['person_speaking', 'product_showcase', 'lifestyle_scene', 'abstract_concept'])
  subject_focus?: string;

  @IsOptional()
  @IsString()
  @IsIn(['studio_minimal', 'office_professional', 'lifestyle_natural', 'luxury_premium'])
  location_environment?: string;
}