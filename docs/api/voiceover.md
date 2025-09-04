# Voice Generation

**Important**: All voice generation endpoints now require a valid `projectId` in the request body. These endpoints will not work without providing a correct project ID.

## Endpoints

### `POST /voice-gen` - Generate voice using ElevenLabs AI
- **Requires**: JWT Authentication
- **Features**: Advanced text-to-speech conversion with customizable voice parameters
- **Model**: ElevenLabs eleven_multilingual_v2 with JBFqnCBsd6RMkjVDRZzb voice
- **Credits**: 10 credits per generation
- **Body Parameters**:
  - `narration` (required): Text to convert to speech (max 5000 characters)
  - `segmentId` (required): Unique identifier for this voice generation
  - `projectId` (required): ID of the project to save the voice to
  - `voiceId` (optional): ElevenLabs voice ID (default: JBFqnCBsd6RMkjVDRZzb)
  - `modelId` (optional): ElevenLabs model ID (default: eleven_multilingual_v2)
  - `isEditCall` (optional): Whether this is an edit operation (default: false)
  - `speed` (optional): Speech rate 0.7-1.2 (default: 1.0)
  - `stability` (optional): Voice consistency 0.0-1.0 (default: 0.5)
  - `similarityBoost` (optional): Voice similarity 0.0-1.0 (default: 0.5)
  - `styleExaggeration` (optional): Style emphasis 0.0-1.0 (default: 0.0)
  - `useSpeakerBoost` (optional): Enhanced similarity (default: false)

- **Example Request**:

  ```json
  {
    "narration": "Welcome to our amazing product demonstration. Today we'll explore the innovative features that make this water bottle the perfect choice for your daily hydration needs.",
    "segmentId": "segment-123",
    "projectId": "clxyz123abc",
    "speed": 0.9,
    "stability": 0.7,
    "similarityBoost": 0.8,
    "styleExaggeration": 0.0,
    "useSpeakerBoost": false
  }
  ```

- **Example Response**:

  ```json
  {
    "id": "cmf10ddhn0008scuiok4ggr8m",
    "s3_key": "clxyz123abc/audio/segment-123/583dfd3e-39a6-4aab-aa8b-0996491b6a36.mp3",
    "model": "eleven_multilingual_v2",
    "audio_size_bytes": 107460,
    "credits": {
      "used": 10,
      "balance": 90
    }
  }
  ```

### `POST /chat` - Generate voice via chat endpoint
- **Requires**: JWT Authentication
- **Features**: Voice generation through the unified chat interface
- **Credits**: 10 credits per generation
- **Body Parameters**:
  - `gen_type` (required): Must be "voice"
  - `narration` (required): Text to convert to speech
  - `model` (required): Must be "elevenlabs"
  - `art_style` (required): Style description (used for categorization)
  - `segmentId` (required): Unique identifier
  - `projectId` (required): Project ID
  - All voice parameters from `/voice-gen` endpoint are supported

- **Example Request**:

  ```json
  {
    "gen_type": "voice",
    "narration": "This is a dynamic and energetic voice for our product launch!",
    "model": "elevenlabs",
    "art_style": "energetic",
    "segmentId": "chat-456",
    "projectId": "clxyz123abc",
    "speed": 1.1,
    "stability": 0.4,
    "similarityBoost": 0.6,
    "useSpeakerBoost": false
  }
  ```

### `POST /chat/voice` - Dedicated voice endpoint
- **Requires**: JWT Authentication
- **Features**: Simplified voice generation endpoint
- **Credits**: 10 credits per generation
- **Body Parameters**: Same as `/chat` endpoint but `gen_type` is automatically set to "voice"

### `GET /voice-gen/history` - Get voice generation history
- **Requires**: JWT Authentication
- **Query Parameters**:
  - `projectId` (optional): Filter by project ID
- **Returns**: Array of user's voice generations

### `GET /voice-gen/:id` - Get specific voice generation
- **Requires**: JWT Authentication
- **URL Parameter**: `id` - The voice generation ID
- **Returns**: Voice generation details

## Voice Parameters Guide

### Core Parameters
- **Voice ID**: JBFqnCBsd6RMkjVDRZzb (Professional, clear English voice)
- **Model**: eleven_multilingual_v2 (Supports multiple languages)
- **Output Format**: MP3 (44.1 kHz, 128 kbps)
- **Character Limit**: 5,000 characters per request
- **Credits**: 10 credits per generation

### Advanced Voice Settings

| Parameter | Range | Default | Description | Recommendation |
|-----------|-------|---------|-------------|----------------|
| **speed** | 0.7-1.2 | 1.0 | Speech rate | 0.8-0.9 for narration, 1.0-1.1 for dynamic content |
| **stability** | 0.0-1.0 | 0.5 | Voice consistency | 0.6-0.8 for professional, 0.3-0.5 for conversational |
| **similarityBoost** | 0.0-1.0 | 0.5 | Voice similarity | 0.7-0.8 for high quality, 0.5-0.6 for natural |
| **styleExaggeration** | 0.0-1.0 | 0.0 | Style emphasis | Keep at 0.0-0.2 for stability |
| **useSpeakerBoost** | true/false | false | Enhanced similarity | Use sparingly (adds latency) |

### Voice Presets

**Professional/Narration:**
```json
{
  "speed": 0.9,
  "stability": 0.8,
  "similarityBoost": 0.7,
  "styleExaggeration": 0.0,
  "useSpeakerBoost": false
}
```

**Dynamic/Conversational:**
```json
{
  "speed": 1.0,
  "stability": 0.4,
  "similarityBoost": 0.6,
  "styleExaggeration": 0.1,
  "useSpeakerBoost": false
}
```

**High Quality/Slow:**
```json
{
  "speed": 0.8,
  "stability": 0.7,
  "similarityBoost": 0.8,
  "styleExaggeration": 0.0,
  "useSpeakerBoost": true
}
```

## File Storage

- **S3 Bucket**: `voiceover-and-music`
- **Region**: `ap-south-1` (Asia Pacific - Mumbai)
- **Path Structure**: `{projectId}/audio/{segmentId}/{uuid}.mp3`
- **Access**: Files are stored in your S3 bucket and can be accessed via the returned `s3_key`

## Error Handling

- **400 Bad Request**: 
  - Invalid narration (empty or too long)
  - Invalid project ID or project doesn't belong to user
  - Invalid voice parameters (out of range)
  - Insufficient credits
- **401 Unauthorized**: Invalid or expired JWT token
- **500 Internal Server Error**: 
  - ElevenLabs API issues
  - S3 upload failures
  - Database connection issues

## Credit System

- **Cost**: 10 credits per voice generation
- **Refund**: Automatic refund if generation fails
- **Check Balance**: Use `/credits/balance/{userId}` endpoint
- **History**: Use `/credits/history/{userId}` endpoint

## Authentication

All endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

To get a JWT token, use the authentication endpoints:
- `GET /auth/web/google` - Web OAuth flow
- `POST /auth/test/generate-token` - Test token generation (development only)
