import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class ImageToVideoDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  @IsIn(['5s', '8s', '10s'])
  duration?: string = '8s';

  @IsString()
  @IsOptional()
  projectId?: string;
}
