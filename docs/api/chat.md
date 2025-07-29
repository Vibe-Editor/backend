# Chat API

The Chat API provides a unified interface for generating images and videos using various AI models. It supports both image generation (using Recraft and Imagen models) and video generation (using Kling and RunwayML models).

## Base URL

```
POST /chat
```

## Overview

This endpoint allows users to generate images or videos based on prompts and art styles. The service automatically handles the generation process and uploads the results to S3 storage.

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
| `model`            | string | Yes         | The AI model to use for generation              | Must be one of: `recraft-v3`, `imagen`, `kling-v2.1-master`, `gen4_turbo` |
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

## Supported Models

### Image Generation Models

| Model        | Provider      | Description                             | Image Size |
| ------------ | ------------- | --------------------------------------- | ---------- |
| `recraft-v3` | Recraft AI    | Realistic photographic image generation | 1024x1024  |
| `imagen`     | Google Gemini | High-quality image generation           | Variable   |

### Video Generation Models

| Model               | Provider | Description               | Duration  | Resolution |
| ------------------- | -------- | ------------------------- | --------- | ---------- |
| `kling-v2.1-master` | Fal.ai   | Image-to-video generation | 5 seconds | Variable   |
| `gen4_turbo`        | RunwayML | Advanced video generation | 5 seconds | 1280:720   |

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
  "image_size_bytes": 245760
}
```

### Video Generation Example

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
  "model": "kling-v2.1-master"
}
```

## Notes

- **Image Generation**: The service automatically uploads generated images to S3 and returns the S3 key for future reference.
- **Video Generation**: Requires an existing image S3 key as input. The service downloads the image, processes it with the video model, and uploads the result back to S3.
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
