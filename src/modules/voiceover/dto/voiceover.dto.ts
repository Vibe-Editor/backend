import { IsString, IsNotEmpty } from 'class-validator';

export class VoiceoverDto {
  @IsString()
  @IsNotEmpty()
  narration_prompt: string;
}