# Image-to-Video API

The Image-to-Video API provides a dedicated endpoint for generating videos from images using the Veo3 model. This endpoint is specifically designed for image-to-video conversion with customizable duration settings.

## Base URL

```
POST /video-gen/image-to-video
```

## Overview

This endpoint allows users to generate videos from existing images using Google's Veo3 model via Fal.ai. The service automatically handles the video generation process, uploads the results to S3 storage, deducts credits, and saves the generation records to the database.

## Request

### Headers

| Header          | Type   | Required | Description                     |
| --------------- | ------ | -------- | ------------------------------- |
| `Content-Type`  | string | Yes      | Must be `application/json`      |
| `Authorization` | string | Yes      | Bearer token for authentication |

### Request Body

```json
{
  "id": "string",
  "prompt": "string", 
  "duration": "string",
  "projectId": "string"
}
```

### Request Parameters

| Parameter   | Type   | Required | Description                                     | Validation                    |
| ----------- | ------ | -------- | ----------------------------------------------- | ----------------------------- |
| `id`        | string | Yes      | S3 key of the source image                      | Non-empty string              |
| `prompt`    | string | Yes      | Animation prompt for video generation           | Non-empty string              |
| `duration`  | string | No       | Video duration                                  | Must be '5s', '8s', or '10s'  |
| `projectId` | string | No       | Project identifier for organization             | Optional string               |

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "s3Key": "string",
  "model": "veo3",
  "credits": {
    "used": 750,
    "balance": 150.0
  },
  "duration": "8s",
  "generationTime": 45000
}
```

### Response Fields

| Field            | Type    | Description                                    |
| ---------------- | ------- | ---------------------------------------------- |
| `success`        | boolean | Indicates if the generation was successful     |
| `s3Key`          | string  | S3 key of the generated video                  |
| `model`          | string  | Model used for generation (always "veo3")     |
| `credits.used`   | number  | Credits deducted for this generation           |
| `credits.balance`| number  | User's remaining credit balance                |
| `duration`       | string  | Duration of the generated video                |
| `generationTime` | number  | Time taken for generation in milliseconds      |

### Error Responses

#### 400 Bad Request - Insufficient Credits
```json
{
  "statusCode": 400,
  "message": "Insufficient credits. Required: 750, Available: 100.0",
  "error": "Bad Request"
}
```

#### 400 Bad Request - Validation Error
```json
{
  "statusCode": 400,
  "message": ["id should not be empty", "prompt should not be empty"],
  "error": "Bad Request"
}
```

#### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Image-to-video generation failed: [error details]",
  "error": "Internal Server Error"
}
```

## Usage Examples

### Basic Image-to-Video Generation

```bash
curl -X POST "https://api.usuals.ai/video-gen/image-to-video" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "id": "images/user123/source-image.png",
    "prompt": "A beautiful sunset over the ocean with gentle waves",
    "duration": "8s",
    "projectId": "project-456"
  }'
```

### Minimum Required Fields

```bash
curl -X POST "https://api.usuals.ai/video-gen/image-to-video" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "id": "images/user123/source-image.png",
    "prompt": "Animate this image with subtle motion"
  }'
```

## Features

- **Veo3 Integration**: Uses Google's Veo3 model via Fal.ai for high-quality video generation
- **Flexible Duration**: Supports 5s, 8s, and 10s video durations
- **Credit Management**: Automatic credit deduction with refund on failure
- **S3 Storage**: Automatic upload and storage of generated videos
- **Database Tracking**: Complete generation history and metadata storage
- **Error Handling**: Comprehensive error handling with detailed error messages

## Credit Costs

| Model | Duration | Credits |
| ----- | -------- | ------- |
| Veo3  | Any      | 750     |

## Rate Limits

- Standard API rate limits apply
- Credit balance must be sufficient for generation
- One generation per request

## Notes

- The `id` parameter should be a valid S3 key pointing to an existing image
- Images are automatically converted to base64 for processing
- Generated videos are stored in S3 with automatic key generation
- All generations are logged for audit and debugging purposes
- Credits are automatically refunded if generation fails after deduction
