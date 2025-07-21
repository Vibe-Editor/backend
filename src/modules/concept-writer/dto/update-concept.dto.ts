import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateConceptDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;
}
