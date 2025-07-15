import { IsString, IsNotEmpty } from 'class-validator';

export class ConceptWriterDto {
    @IsString()
    @IsNotEmpty()
    prompt: string;

    @IsString()
    @IsNotEmpty()
    web_info: string;
}