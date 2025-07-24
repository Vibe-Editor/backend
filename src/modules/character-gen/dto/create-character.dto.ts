import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  Matches,
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

  // Array of exactly 6 S3 keys for reference images
  @IsArray()
  @ArrayMinSize(6, { message: 'Exactly 6 reference images are required' })
  @ArrayMaxSize(6, { message: 'Exactly 6 reference images are required' })
  @Matches(/^[a-zA-Z0-9\-_\/\.]+$/, {
    each: true,
    message: 'Each reference image must be a valid S3 key',
  })
  reference_images: string[];
}
