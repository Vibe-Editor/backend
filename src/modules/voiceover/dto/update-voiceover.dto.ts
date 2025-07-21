import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateVoiceoverDto {
  @IsString()
  @IsNotEmpty()
  narration_prompt: string;
}
