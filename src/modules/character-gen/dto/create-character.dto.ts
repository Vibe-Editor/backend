import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsUrl,
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

  // Array of exactly 6 CloudFront URLs to reference images
  @IsArray()
  @ArrayMinSize(6, { message: 'Exactly 6 reference images are required' })
  @ArrayMaxSize(6, { message: 'Exactly 6 reference images are required' })
  @IsUrl({}, { each: true })
  reference_images: string[];
}
