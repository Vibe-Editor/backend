import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateSegmentationDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  prompt?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  concept?: string;

  @IsString()
  @IsOptional()
  negative_prompt?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}
