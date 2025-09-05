import { IsString, IsOptional } from 'class-validator';

export class UpdateSummaryDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}
