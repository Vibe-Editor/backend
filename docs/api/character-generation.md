# Character Generation API

## Overview
Generates character sprite sheets and final characters from 6 reference images using OpenAI GPT-4o Vision and Recraft image-to-image models.

## Endpoints

### POST /character-gen
Generate a character from reference images.

**Authentication:** Required (JWT Bearer token)

**Content-Type:** `multipart/form-data`

#### Request Body
- `visual_prompt` (string, required): Character description
- `art_style` (string, required): Art style specification  
- `uuid` (string, required): Unique identifier
- `name` (string, optional): Character name
- `description` (string, optional): Character description
- `reference_images` (file[], required): Exactly 6 image files

#### Response
```json
{
  "success": true,
  "character_id": "string",
  "sprite_sheet_s3_key": "string", 
  "final_character_s3_key": "string",
  "model": "openai-recraft-character-gen",
  "message": "Character generated successfully"
}
```

### GET /character-gen
Get all characters for authenticated user.

**Authentication:** Required (JWT Bearer token)

#### Query Parameters
- `id` (string, optional): Specific character ID
- `projectId` (string, optional): Filter by project

### GET /character-gen/:id
Get specific character by ID.

**Authentication:** Required (JWT Bearer token)

## Process Flow
1. Upload 6 reference images to S3
2. Generate sprite sheet using OpenAI GPT-4o Vision (200 tokens) + DALL-E 2 (256x256)
3. Generate final character using Recraft image-to-image (256x256)
4. Store results in database and S3
5. Return S3 keys for both outputs

## Error Codes
- `400`: Invalid input (missing fields, wrong number of images)
- `401`: Authentication required
- `500`: Internal server error 