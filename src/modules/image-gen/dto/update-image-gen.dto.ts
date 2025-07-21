import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateImageGenDto {
  @IsString()
  @IsNotEmpty()
  visual_prompt: string;

  @IsString()
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsOptional()
  s3_key?: string;
}
