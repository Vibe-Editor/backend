import { IsString, IsNotEmpty } from 'class-validator';

export class ImageGenDto {
  @IsString()
  @IsNotEmpty()
  visual_prompt: string;

  @IsString()
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsNotEmpty()
  uuid: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;
}
