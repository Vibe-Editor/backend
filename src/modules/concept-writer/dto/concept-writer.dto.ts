import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class ConceptWriterDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsNotEmpty()
  web_info: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsOptional()
  @IsIn(['gemini-flash', 'gemini-pro', 'gpt-5'])
  model?: string = 'gpt-5';

  @IsString()
  @IsOptional()
  system_prompt?: string; // Add this line

  @IsString()
  @IsOptional()
  @IsIn(['expand'])

  mode?: string; // Add this line
}
