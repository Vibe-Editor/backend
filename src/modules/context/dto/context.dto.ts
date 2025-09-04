
import { IsArray, ArrayNotEmpty, IsString, IsNotEmpty } from 'class-validator';

export class UpdateUserContextDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;
}


export class UpdateProjectSummaryDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  newConversations: string[];
}