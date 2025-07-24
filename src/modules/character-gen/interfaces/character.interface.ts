export interface CharacterGenerationResult {
  s3_key: string;
  model: string;
  image_size_bytes: number;
}

export interface SpriteSheetGenerationResult {
  s3_key: string;
  model: string;
  image_size_bytes: number;
}

export interface CharacterGenerationData {
  id: string;
  name?: string;
  description?: string;
  referenceImages: string[];
  spriteSheetS3Key?: string;
  finalCharacterS3Key?: string;
  visualPrompt: string;
  artStyle: string;
  uuid: string;
  success: boolean;
  model?: string;
  message?: string;
  projectId?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
