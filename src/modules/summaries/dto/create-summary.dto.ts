import { IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateSummaryDto {
  @IsString()
  content: string;

  @IsString()
  summary: string;

  @IsEnum(['concept', 'segment'])
  contentType: 'concept' | 'segment';

  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  relatedId?: string; // ID of the concept or segment this summary belongs to
}
