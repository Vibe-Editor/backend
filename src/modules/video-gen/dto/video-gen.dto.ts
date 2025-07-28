import { IsString, IsNotEmpty } from 'class-validator';

export class VideoGenDto {
  @IsString()
  @IsNotEmpty()
  animation_prompt: string;

  @IsString()
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsNotEmpty()
  imageS3Key: string;

  @IsString()
  @IsNotEmpty()
  uuid: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;
}
