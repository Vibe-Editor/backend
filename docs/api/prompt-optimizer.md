# Prompt Optimizer Module

The Prompt Optimizer module is a NestJS module that provides AI-powered prompt optimization and video generation capabilities. It leverages OpenAI's GPT-4o model to enhance and optimize prompts, and integrates with the Veo3 video generation API through fal.ai.

## Overview

This module offers three main functionalities:
1. **Prompt Optimization** - Enhance and optimize prompts using AI
2. **Video Generation with Optimized Prompts** - Generate videos using pre-optimized prompts
3. **Combined Optimization and Video Generation** - Optimize prompts and generate videos in a single workflow

## Architecture

### Components

- **Controller** (`prompt-optimizer.controller.ts`) - HTTP endpoints for prompt optimization and video generation
- **Service** (`prompt-optimizer.service.ts`) - Core business logic for prompt optimization and video generation
- **Module** (`prompt-optimizer.module.ts`) - NestJS module configuration
- **DTOs** - Data transfer objects for request validation

### Dependencies

- **OpenAI API** - For prompt optimization using GPT-4o
- **fal.ai Veo3 API** - For text-to-video generation
- **Credit Service** - For managing user credits (currently commented out)
- **S3 Service** - For storing generated videos

## API Endpoints

### 1. Optimize Prompt
**POST** `/prompt-optimizer/optimize`

Optimizes a JSON prompt based on description and user preferences.

#### Request Body
```typescript
{
  "jsonPrompt": "string",      // Original JSON prompt to optimize
  "description": "string",     // Description of what the prompt should accomplish
  "userPreferences": "string"  // User preferences for optimization
}
```

#### Response
```typescript
{
  "optimizedPrompt": "string"  // The optimized prompt in JSON format
}
```

### 2. Generate Video with Optimized Prompt
**POST** `/prompt-optimizer/generate-video`

Generates a video using an already optimized prompt.

#### Request Body
```typescript
{
  "optimizedPrompt": "string", // Pre-optimized prompt for video generation
  "segmentId": "string",       // Unique identifier for the video segment
  "projectId": "string"        // Project identifier
}
```

#### Response
```typescript
{
  "videoResult": {
    "s3Keys": ["string"],      // Array of S3 keys for generated videos
    "model": "string",         // Model used (veo3-text-to-video)
    "totalVideos": number,     // Number of videos generated
    "videoUrl": "string"       // Direct URL to the generated video
  }
}
```

### 3. Optimize and Generate Video
**POST** `/prompt-optimizer/optimize-and-generate`

Combines prompt optimization and video generation in a single request.

#### Request Body
```typescript
{
  "jsonPrompt": "string",      // Original JSON prompt to optimize
  "description": "string",     // Description of what the prompt should accomplish
  "userPreferences": "string", // User preferences for optimization
  "segmentId": "string",       // Unique identifier for the video segment
  "projectId": "string"        // Project identifier
}
```

#### Response
```typescript
{
  "optimizedPrompt": "string", // The optimized prompt used
  "s3Key": "string"           // S3 key of the generated video
}
```

## Configuration

### Environment Variables

The following environment variables must be set:

```bash
# OpenAI API key for prompt optimization
OPENAI_API_KEY=your_openai_api_key

# fal.ai API key for video generation
FAL_KEY=your_fal_api_key
```

### Video Generation Parameters

The service uses the following default parameters for Veo3 video generation:
- **Duration**: 8 seconds
- **Aspect Ratio**: 16:9
- **Inference Steps**: 25
- **Guidance Scale**: 3.5

## Usage Examples

### Basic Prompt Optimization

```typescript
const optimizationRequest = {
  jsonPrompt: '{"scene": "A person walking", "style": "realistic"}',
  description: "Create a cinematic scene of someone walking through a busy city street",
  userPreferences: "Focus on urban atmosphere, dramatic lighting, and smooth camera movement"
};

const result = await promptOptimizerService.optimizePrompt(optimizationRequest);
console.log(result.optimizedPrompt);
```

### Video Generation with Optimization

```typescript
const videoRequest = {
  jsonPrompt: '{"scene": "A person walking", "style": "realistic"}',
  description: "Create a cinematic scene of someone walking through a busy city street",
  userPreferences: "Focus on urban atmosphere, dramatic lighting, and smooth camera movement",
  segmentId: "segment_123",
  projectId: "project_456"
};

const result = await promptOptimizerService.optimizeAndGenerateVideo(videoRequest, userId);
console.log(`Optimized prompt: ${result.optimizedPrompt}`);
console.log(`Video S3 key: ${result.s3Key}`);
```

## Error Handling

The service includes comprehensive error handling:

- **OpenAI API Errors** - Handles API failures and invalid responses
- **fal.ai API Errors** - Manages video generation failures
- **S3 Upload Errors** - Handles file upload issues
- **Credit Management** - Manages insufficient credits and refunds (when enabled)

All errors are logged using NestJS Logger and wrapped in `InternalServerErrorException`.

## Credit System Integration

The module is designed to integrate with a credit system for usage tracking and billing. The credit-related code is currently commented out but can be enabled by:

1. Uncommenting the credit check and deduction code
2. Ensuring the `CreditService` is properly configured
3. Setting up appropriate credit costs for video generation operations

## Security

- The module uses the `@Public()` decorator, making endpoints publicly accessible
- JWT authentication is available but currently not enforced
- API keys are securely stored in environment variables

## Logging

The service provides detailed logging for:
- Prompt optimization processes
- Video generation steps
- Error conditions
- Credit transactions (when enabled)

## Future Enhancements

Potential improvements include:
- Support for different video durations and aspect ratios
- Multiple video generation models
- Batch processing capabilities
- Advanced prompt templates
- Real-time generation status updates
- Enhanced error recovery mechanisms

## Testing

The module can be tested using:
- Unit tests for service methods
- Integration tests for API endpoints
- Mock services for external API dependencies

## Contributing

When contributing to this module:
1. Follow NestJS best practices
2. Add appropriate error handling
3. Include comprehensive logging
4. Update DTOs for new request/response formats
5. Test with both successful and error scenarios
