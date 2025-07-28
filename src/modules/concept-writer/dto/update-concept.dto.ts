import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateConceptDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}
