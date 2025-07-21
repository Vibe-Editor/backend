import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateWebInfoDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;
}
