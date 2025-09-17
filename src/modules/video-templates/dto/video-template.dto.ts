import { IsString, IsNotEmpty } from 'class-validator';

export class FindSimilarTemplatesDto {
  @IsString()
  @IsNotEmpty()
  description: string;
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
