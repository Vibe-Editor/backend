import { IsString, IsNotEmpty } from 'class-validator';

export class VideoGenWithOptimizationDto {
  @IsString()
  @IsNotEmpty()
  optimizedPrompt: string;

  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;
}
