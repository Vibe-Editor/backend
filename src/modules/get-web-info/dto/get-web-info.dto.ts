import { IsString, IsNotEmpty } from 'class-validator';

export class GetWebInfoDto {
    @IsString()
    @IsNotEmpty()
    prompt: string;
}