import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateImageGenDto {
  @IsString()
  @IsNotEmpty()
  visual_prompt: string;
}
