# Voiceover Generation

**Important**: All voiceover endpoints now require a valid `projectId` in the request body. These endpoints will not work without providing a correct project ID.

- `POST /voiceover` - Generate voiceovers using ElevenLabs AI
  - **Requires**: JWT Authentication
  - **Features**: Text-to-speech conversion with high-quality AI voices
  - **Model**: ElevenLabs eleven_multilingual_v2 with JBFqnCBsd6RMkjVDRZzb voice
  - **Body Parameters**:
    - `narration_prompt` (required): Text to convert to speech (max 5000 characters)
    - `projectId` (required): ID of the project to save the voiceover to
  - **Example Request**:

  ```json
  {
    "narration_prompt": "Welcome to our amazing product demonstration. Today we'll explore the innovative features that make this water bottle the perfect choice for your daily hydration needs.",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "s3_key": "voiceovers/abc123-def456.mp3",
    "message": "Voiceover generated and uploaded successfully",
    "audio_size_bytes": 145620,
    "credits": {
      "used": 5.5,
      "balance": 44.5
    }
  }
  ```

- `GET /voiceover` - Get all generated voiceovers
  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific voiceover by ID
    - `projectId` (optional): Filter voiceovers by project
  - **Returns**: Array of all user's generated voiceovers

- `PATCH /voiceover/:id` - Update a specific generated voiceover
  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The voiceover ID to update
  - **Body Parameters**:
    - `narration_prompt` (required): Updated text for the voiceover
    - `s3_key` (optional): Updated S3 key for the audio file
    - `projectId` (optional): Move voiceover to a different project
  - **Example Request**:

  ```json
  {
    "narration_prompt": "Welcome to our enhanced product demonstration. Today we'll explore the revolutionary features that make this eco-friendly water bottle the ultimate choice for sustainable hydration.",
    "s3_key": "voiceovers/updated-abc123-def456.mp3",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Voiceover updated successfully",
    "voiceover": {
      "id": "clxyz123abc",
      "narrationPrompt": "Welcome to our enhanced product demonstration. Today we'll explore the revolutionary features that make this eco-friendly water bottle the ultimate choice for sustainable hydration.",
      "s3Key": "voiceovers/updated-abc123-def456.mp3",
      "projectId": "proj123",
      "userId": "user123",
      "createdAt": "2025-01-16T10:30:00Z",
      "project": {
        "id": "proj123",
        "name": "My Video Project"
      }
    }
  }
  ```

## Voice Configuration

- **Voice ID**: JBFqnCBsd6RMkjVDRZzb (Professional, clear English voice)
- **Model**: eleven_multilingual_v2 (Supports multiple languages)
- **Output Format**: MP3 (44.1 kHz, 128 kbps)
- **Character Limit**: 5,000 characters per request

## Error Handling

- **400 Bad Request**: Invalid narration_prompt (empty or too long)
- **500 Internal Server Error**: ElevenLabs API issues, quota exceeded, or storage errors
- **404 Not Found**: Voiceover not found or access denied (for PATCH requests)
