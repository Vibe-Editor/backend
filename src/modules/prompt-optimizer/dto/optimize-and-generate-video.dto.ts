import { IsString, IsNotEmpty } from 'class-validator';

export class OptimizeAndGenerateVideoDto {
  @IsString()
  @IsNotEmpty()
  jsonPrompt: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  userPreferences: string;

  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;
}
