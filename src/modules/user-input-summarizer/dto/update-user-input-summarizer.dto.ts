import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateUserInputSummarizerDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  original_content?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  user_input?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}
