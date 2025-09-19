import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class SegmentationDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsNotEmpty()
  concept: string;

  @IsString()
  @IsOptional()
  negative_prompt: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  @IsIn(['pro', 'flash', 'openai', 'gpt-5'])
  model?: 'pro' | 'flash' | 'openai' | 'gpt-5' = 'gpt-5';

  @IsString()
  @IsOptional()
  @IsIn(['story'])
  mode?: 'story'; 


  @IsOptional()
  preferences?: {
    visualStyle?: string;
    lightingMood?: string;
    cameraStyle?: string;
    subjectFocus?: string;
    locationEnvironment?: string;
    finalConfig?: any;
    wordCount: number;
  };
}
