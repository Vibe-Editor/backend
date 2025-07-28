import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateWebInfoDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}
