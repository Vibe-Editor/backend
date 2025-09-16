# Chat API

The Chat API provides a unified interface for generating images and videos using various AI models. It supports both image generation (using Recraft and Imagen models) and video generation (using Kling, RunwayML, Veo2, and Veo3 models with automatic model selection).

## Base URL

```
POST /chat
```

## Overview

This endpoint allows users to generate images or videos based on prompts and art styles. The service automatically handles the generation process, uploads the results to S3 storage, deducts credits based on the model used, and saves the generation records to the database for persistence and tracking.

## Request

### Headers

| Header          | Type   | Required | Description                     |
| --------------- | ------ | -------- | ------------------------------- |
| `Content-Type`  | string | Yes      | Must be `application/json`      |
| `Authorization` | string | Yes      | Bearer token for authentication |

### Request Body

```json
{
  "model": "string",
  "gen_type": "string",
  "uuid": "string",
  "visual_prompt": "string",
  "animation_prompt": "string",
  "image_s3_key": "string",
  "art_style": "string",
  "projectId": "string"
}
```

### Request Parameters

| Parameter          | Type   | Required    | Description                                     | Validation                                                                |
| ------------------ | ------ | ----------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `model`            | string | Yes         | The AI model to use for generation              | Must be one of: `recraft-v3`, `imagen`, `kling-v2.1-master`, `gen4_turbo`, `veo3` |
| `gen_type`         | string | Yes         | Type of generation                              | Must be either `image` or `video`                                         |
| `uuid`             | string | Yes         | Unique identifier for the user                  | Non-empty string                                                          |
| `visual_prompt`    | string | Conditional | Text description for image generation           | Required when `gen_type` is `image`                                       |
| `animation_prompt` | string | Conditional | Text description for video generation           | Required when `gen_type` is `video`                                       |
| `image_s3_key`     | string | Conditional | S3 key of the source image for video generation | Required when `gen_type` is `video`                                       |
| `art_style`        | string | Yes         | Art style to apply to the generation            | Non-empty string                                                          |
| `projectId`        | string | Yes         | Project identifier                              | Non-empty string                                                          |

## Response

### Success Response

#### Image Generation Response

```json
{
  "s3_key": "string",
  "model": "string",
  "image_size_bytes": "number"
}
```

#### Video Generation Response

```json
{
  "s3_key": "string",
  "model": "string"
}
```

### Response Fields

| Field              | Type   | Description                                                  |
| ------------------ | ------ | ------------------------------------------------------------ |
| `s3_key`           | string | S3 key where the generated content is stored                 |
| `model`            | string | The model used for generation                                |
| `image_size_bytes` | number | Size of the generated image in bytes (image generation only) |

### Error Responses

#### 400 Bad Request

```json
{
  "statusCode": 400,
  "message": "imageS3Key is required for video generation",
  "error": "Bad Request"
}
```

#### 500 Internal Server Error

```json
{
  "statusCode": 500,
  "message": "Failed to generate image",
  "error": "Internal Server Error"
}
```

## Credit Requirements

The chat endpoint now deducts credits based on the model used:

### Image Generation Credits

| Model        | Credits Required |
| ------------ | ---------------- |
| `recraft-v3` | 1 credit         |
| `imagen`     | 2 credits        |

### Video Generation Credits

| Model               | Credits Required | Description |
| ------------------- | ---------------- | ----------- |
| `veo3`              | 37.5 credits     | Direct Veo3 model |
| `kling-v2.1-master` | 20 credits       | Direct Kling model |
| `gen4_turbo`        | 2.5 credits      | Direct RunwayML model |

**Note**: Credits are deducted before generation begins. If generation fails, the credits are still consumed but the failure is recorded in the database.

## Supported Models

### Image Generation Models

| Model        | Provider      | Description                             | Image Size |
| ------------ | ------------- | --------------------------------------- | ---------- |
| `recraft-v3` | Recraft AI    | Realistic photographic image generation | 1024x1024  |
| `imagen`     | Google Gemini | High-quality image generation           | Variable   |

### Video Generation Models

| Model               | Provider | Description               | Duration  | Resolution | Credits |
| ------------------- | -------- | ------------------------- | --------- | ---------- | ------- |
| `veo3`              | Fal.ai   | Ultra-high quality professional | 5 seconds | Variable   | 37.5     |
| `kling-v2.1-master` | Fal.ai   | Image-to-video generation | 5 seconds | Variable   | 20       |
| `gen4_turbo`        | RunwayML | Advanced video generation | 5 seconds | 1280:720   | 2.5      |

## Examples

### Image Generation Example

**Request:**

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "recraft-v3",
    "gen_type": "image",
    "uuid": "user-123",
    "visual_prompt": "A majestic mountain landscape at sunset",
    "art_style": "photorealistic",
    "projectId": "project-456"
  }'
```

**Response:**

```json
{
  "s3_key": "user-123/images/abc123-def456.png",
  "model": "recraft-v3",
  "image_size_bytes": 245760,
  "credits": {
    "used": 1,
    "balance": 49.5
  }
}
```

### Veo3 Video Generation Example

**Request:**

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "veo3",
    "gen_type": "video",
    "uuid": "user-123",
    "animation_prompt": "A professional cinematic scene with smooth camera movement, high-quality lighting, and detailed motion for commercial use",
    "image_s3_key": "user-123/images/abc123-def456.png",
    "art_style": "cinematic, professional, high-quality",
    "projectId": "project-456"
  }'
```

**Response:**

```json
{
  "s3_key": "user-123/videos/xyz789-uvw012.mp4",
  "model": "veo3",
  "credits": {
    "used": 37.5,
    "balance": 62.5
  }
}
```

### Kling Video Generation Example

**Request:**

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "kling-v2.1-master",
    "gen_type": "video",
    "uuid": "user-123",
    "animation_prompt": "The mountain landscape comes alive with flowing clouds and moving shadows",
    "image_s3_key": "user-123/images/abc123-def456.png",
    "art_style": "cinematic",
    "projectId": "project-456"
  }'
```

**Response:**

```json
{
  "s3_key": "user-123/videos/xyz789-uvw012.mp4",
  "model": "kling-v2.1-master",
  "credits": {
    "used": 20,
    "balance": 29.5
  }
}
```

## Notes

- **Credit System**: Credits are automatically deducted before generation begins based on the selected model. Users must have sufficient credits to proceed.
- **Database Persistence**: All generation requests and responses are saved to the database, including both successful and failed attempts for tracking purposes.
- **Image Generation**: The service automatically uploads generated images to S3, saves the generation record to the database, and returns the S3 key for future reference.
- **Video Generation**: Requires an existing image S3 key as input. The service downloads the image, processes it with the video model, uploads the result back to S3, and saves both the video record and file reference to the database.
- **Error Tracking**: Failed generation attempts are also recorded in the database with error messages for debugging and analytics purposes.
- **Insufficient Credits**: If a user doesn't have enough credits, the request will fail with a 400 Bad Request error before any generation is attempted.
- **Prompt Length Limits**:
  - Kling model: Animation prompts are automatically trimmed to 1500 characters
  - RunwayML model: Animation prompts are automatically trimmed to 950 characters
- **Error Handling**: The service provides specific error messages for different failure scenarios and logs detailed information for debugging.
- **S3 Storage**: All generated content is stored in S3 with organized folder structures based on user UUID and content type.

## Rate Limits

Currently, no explicit rate limits are implemented. However, the underlying AI model APIs may have their own rate limits.

## Dependencies

This endpoint requires the following environment variables:

- `S3_BUCKET_NAME`: S3 bucket for storing generated content
- `AWS_REGION`: AWS region for S3 operations
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `RECRAFT_API_KEY`: API key for Recraft AI
- `GEMINI_API_KEY`: API key for Google Gemini
- `FAL_KEY`: API key for Fal.ai
- `RUNWAYML_API_KEY`: API key for RunwayML
