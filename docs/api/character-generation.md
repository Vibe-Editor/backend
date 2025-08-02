# Character Generation API

## Overview
The Character Generation API allows users to create character sprites and generate videos from them using AI models.

## Endpoints

### 1. Generate Character
**POST** `/character-gen`

Creates a character from reference images using GPT-Image-1 and Recraft models.

#### Request Body
```json
{
  "name": "string",
  "description": "string", 
  "visual_prompt": "string",
  "art_style": "string",
  "uuid": "string",
  "reference_images": ["s3_key1", "s3_key2", "s3_key3", "s3_key4", "s3_key5", "s3_key6"]
}
```

#### Response
```json
{
  "success": true,
  "character_id": "string",
  "sprite_sheet_s3_key": "string",
  "final_character_s3_key": "string", 
  "sprite_sheet_url": "https://ds0fghatf06yb.cloudfront.net/...",
  "final_character_url": "https://ds0fghatf06yb.cloudfront.net/...",
  "model": "gpt-image-1-recraft-character-gen",
  "message": "Character generated successfully",
  "video_generation_ready": true,
  "video_generation_endpoint": "/character-gen/{character_id}/generate-video"
}
```

### 2. Get All Characters
**GET** `/character-gen?projectId={projectId}`

Retrieves all characters for the authenticated user.

#### Response
```json
{
  "success": true,
  "count": 5,
  "characters": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "visualPrompt": "string",
      "artStyle": "string",
      "uuid": "string",
      "success": true,
      "spriteSheetS3Key": "string",
      "finalCharacterS3Key": "string",
      "sprite_sheet_url": "https://ds0fghatf06yb.cloudfront.net/...",
      "final_character_url": "https://ds0fghatf06yb.cloudfront.net/...",
      "video_generation_ready": true,
      "video_generation_endpoint": "/character-gen/{character_id}/generate-video"
    }
  ]
}
```

### 3. Get Character by ID
**GET** `/character-gen/{characterId}`

Retrieves a specific character by ID.

#### Response
```json
{
  "success": true,
  "character": {
    "id": "string",
    "name": "string", 
    "description": "string",
    "visualPrompt": "string",
    "artStyle": "string",
    "uuid": "string",
    "success": true,
    "spriteSheetS3Key": "string",
    "finalCharacterS3Key": "string"
  },
  "sprite_sheet_url": "https://ds0fghatf06yb.cloudfront.net/...",
  "final_character_url": "https://ds0fghatf06yb.cloudfront.net/...",
  "video_generation_ready": true,
  "video_generation_endpoint": "/character-gen/{character_id}/generate-video"
}
```

### 4. Generate Video from Character
**POST** `/character-gen/{characterId}/generate-video`

Generates a video from a character's final image using the video generation service.

#### Request Body
```json
{
  "animation_prompt": "string",
  "art_style": "string"
}
```

#### Response
Returns the same response as the video generation API:
```json
{
  "success": true,
  "video_id": "string",
  "uuid": "string",
  "model": "veo2|runwayml|kling",
  "message": "Video generation started successfully"
}
```

## Frontend Integration Flow

### 1. Character Generation
```javascript
// 1. Upload reference images to S3 (6 images required)
const referenceImages = await uploadImagesToS3(images);

// 2. Generate character
const characterResponse = await fetch('/character-gen', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Character',
    description: 'A brave warrior',
    visual_prompt: 'A heroic warrior with armor',
    art_style: 'fantasy',
    uuid: generateUUID(),
    reference_images: referenceImages
  })
});

const character = await characterResponse.json();

// 3. Display character images
if (character.success) {
  displayCharacter(character.final_character_url);
  
  // 4. Show video generation option if ready
  if (character.video_generation_ready) {
    showVideoGenerationButton(character.video_generation_endpoint);
  }
}
```

### 2. Video Generation from Character
```javascript
// Generate video from character
const videoResponse = await fetch(character.video_generation_endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    animation_prompt: 'The warrior walks forward with confidence',
    art_style: 'fantasy'
  })
});

const video = await videoResponse.json();

if (video.success) {
  // Poll for video completion
  pollVideoStatus(video.video_id);
}
```

### 3. Display Characters with Video Options
```javascript
// Get all characters
const charactersResponse = await fetch('/character-gen');
const characters = await charactersResponse.json();

characters.characters.forEach(character => {
  // Display character
  displayCharacter(character.final_character_url);
  
  // Show video generation button if ready
  if (character.video_generation_ready) {
    addVideoButton(character.id, character.video_generation_endpoint);
  }
});
```

## Error Handling

### Common Errors
- `400 Bad Request`: Missing required fields or invalid input
- `401 Unauthorized`: Invalid or missing authentication
- `404 Not Found`: Character not found or access denied
- `500 Internal Server Error`: Server-side processing error

### Error Response Format
```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

## Notes

1. **Image Requirements**: Exactly 6 reference images are required for character generation
2. **Video Generation**: Only available for characters with successful final images
3. **URLs**: All image URLs use CloudFront CDN for optimal performance
4. **Authentication**: All endpoints require JWT authentication
5. **Project Association**: Characters are automatically associated with user's project