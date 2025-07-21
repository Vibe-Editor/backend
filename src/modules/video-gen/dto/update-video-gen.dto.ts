import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateVideoGenDto {
  @IsString()
  @IsNotEmpty()
  animation_prompt: string;
}
