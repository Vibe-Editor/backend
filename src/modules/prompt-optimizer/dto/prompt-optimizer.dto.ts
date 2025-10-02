import { IsString, IsNotEmpty } from 'class-validator';

export class PromptOptimizerDto {
  @IsString()
  @IsNotEmpty()
  jsonPrompt: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  userPreferences: string;
}

