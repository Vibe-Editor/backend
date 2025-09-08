import { IsString, IsOptional, IsEnum } from 'class-validator';

export class GenerateSummaryDto {
  @IsString()
  content: string;

  @IsEnum(['concept', 'segment'])
  contentType: 'concept' | 'segment';

  @IsOptional()
  @IsString()
  projectId?: string;
}
