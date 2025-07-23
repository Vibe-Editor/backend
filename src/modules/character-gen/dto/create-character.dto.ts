import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  @IsNotEmpty()
  visual_prompt: string;

  @IsString()
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsNotEmpty()
  uuid: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CharacterFileUploadDto {
  @IsArray()
  @ArrayMinSize(6, { message: 'Exactly 6 reference images are required' })
  @ArrayMaxSize(6, { message: 'Exactly 6 reference images are required' })
  reference_images: Express.Multer.File[];
}
