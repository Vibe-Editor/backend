import { IsString, IsNotEmpty } from 'class-validator';

export class CreateSegmentDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;
}


