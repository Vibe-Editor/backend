import { IsString, IsNotEmpty } from 'class-validator';

export class FindSimilarTemplatesDto {
  @IsString()
  @IsNotEmpty()
  description: string;
}

export class CreateVideoTemplateDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  jsonPrompt: string;

  @IsString()
  @IsNotEmpty()
  s3Key: string;
}

export class VideoTemplateResponseDto {
  id: string;
  description: string;
  jsonPrompt: string;
  s3Key: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SimilarTemplatesResponseDto {
  templates: VideoTemplateResponseDto[];
  totalCount: number;
}
