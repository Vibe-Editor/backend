import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UserInputSummarizerDto {
  @IsString()
  @IsNotEmpty()
  original_content: string;

  @IsString()
  @IsNotEmpty()
  user_input: string;
}