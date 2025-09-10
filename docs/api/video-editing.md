# Video Editing Module

This module provides video-to-video editing capabilities using Runway's Aleph model.

## Features

- **Video-to-Video Editing**: Transform existing videos using AI prompts
- **Credit Management**: Automatic credit checking, deduction, and refund on failures
- **S3 Storage**: Edited videos are automatically uploaded to S3
- **Database Integration**: Uses existing `GeneratedVideo` and `GeneratedVideoFile` models
- **Status Tracking**: Real-time status updates for video editing operations
- **Asynchronous Processing**: Video editing happens in background, requires status polling

## ⚠️ Important: Asynchronous API

**The video editing API is asynchronous!** You cannot just call the endpoint and wait for the final video in the response.

### How It Works:
1. **Submit Request** → Get operation ID and "processing" status
2. **Poll Status** → Check `/video-editing/status/{operationId}` every 10-30 seconds
3. **Wait for Completion** → Status becomes "SUCCEEDED" or "completed"
4. **Get Final Video** → S3 URL and video URL become available

### Typical Processing Times:
- **Simple edits**: 1-3 minutes
- **Complex edits (adding objects/effects)**: 3-8 minutes
- **High-quality/long videos**: 5-15 minutes

### ❌ Wrong Approach:
```javascript
// This WON'T work - you'll only get "processing" status
const response = await fetch('/video-editing/runway-aleph', {...});
const result = await response.json();
// result.videoUrl will be null, status will be "processing"
```

### ✅ Correct Approach:
```javascript
// 1. Submit request
const response = await fetch('/video-editing/runway-aleph', {...});
const result = await response.json();
const operationId = result.id;

// 2. Poll status until completion
let completed = false;
while (!completed) {
  const statusResponse = await fetch(`/video-editing/status/${operationId}`);
  const status = await statusResponse.json();
  
  if (status.status === 'completed' || status.status === 'SUCCEEDED') {
    console.log('Video ready!', status.s3Key);
    completed = true;
  } else if (status.status === 'failed') {
    console.log('Video failed');
    completed = true;
  } else {
    // Wait 10 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
```

## API Endpoints

### POST `/video-editing/runway-aleph`

Edit a video using Runway's Aleph model (asynchronous - requires status polling).

**Query Parameters:**
- `projectId` (required): Project ID to associate the video with

**Request Body:**
```json
{
  "videoUri": "https://your-video-url.mp4",
  "promptText": "Describe desired video changes here",
  "model": "gen4_aleph",
  "ratio": "1280:720",
  "seed": 12345,
  "references": [
    {
      "type": "image",
      "uri": "https://your-style-image.jpg"
    }
  ],
  "contentModeration": {},
  "publicFigureThreshold": "auto"
}
```

**Response:**
```json
{
  "id": "video_edit_1234567890_abc123def",
  "status": "processing",
  "videoUrl": "https://runway-output-url.mp4",
  "s3Key": "project-id/videos/operation-id/uuid.mp4",
  "message": "Video editing request submitted successfully",
  "taskId": "runway-task-id",
  "creditsUsed": 50,
  "transactionId": "credit-transaction-id",
  "savedVideoId": "generated-video-record-id"
}
```

### POST `/video-editing/runway-aleph/complete` ⭐ **RECOMMENDED**

**Simple one-call solution!** Edit a video and wait for completion internally. Perfect for frontend integration.

**Query Parameters:**
- `projectId` (required): Project ID to associate the video with

**Request Body:**
```json
{
  "videoUri": "https://your-video-url.mp4",
  "promptText": "Describe desired video changes here",
  "model": "gen4_aleph",
  "ratio": "1280:720",
  "seed": 12345,
  "references": [
    {
      "type": "image",
      "uri": "https://your-style-image.jpg"
    }
  ],
  "contentModeration": {},
  "publicFigureThreshold": "auto"
}
```

**Response (when completed):**
```json
{
  "s3Key": "project-id/videos/operation-id/uuid.mp4",
  "videoUrl": "https://runway-output-url.mp4",
  "creditsUsed": 50
}
```

**Features:**
- ✅ Handles entire workflow internally
- ✅ Monitors progress automatically (up to 15 minutes)
- ✅ Downloads and uploads to S3
- ✅ Returns S3 key when ready
- ✅ Perfect for frontend - just one API call!

**Frontend Example:**
```javascript
const response = await fetch('/video-editing/runway-aleph/complete?projectId=proj_123', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    videoUri: 'https://example.com/input-video.mp4',
    promptText: 'Add aliens to this video',
    model: 'gen4_aleph',
    ratio: '1280:720'
  })
});

const result = await response.json();
console.log('S3 Key:', result.s3Key); // Ready to use!
```

### GET `/video-editing/status/:operationId`

Get the status of a video editing operation.

**Response:**
```json
{
  "taskId": "runway-task-id",
  "status": "completed",
  "videoUrl": "https://runway-output-url.mp4",
  "s3Key": "project-id/videos/operation-id/uuid.mp4",
  "progress": 100,
  "message": "Video editing completed successfully"
}
```

### GET `/video-editing/history`

Get user's video editing history with pagination.

**Query Parameters:**
- `page` (default: 1): Page number
- `limit` (default: 20): Items per page

**Response:**
```json
{
  "videoEditings": [
    {
      "id": "video_edit_1234567890_abc123def",
      "promptText": "Make background wintery",
      "model": "runway-aleph-gen4_aleph",
      "status": "completed",
      "s3Keys": ["project-id/videos/operation-id/uuid.mp4"],
      "creditsUsed": 50,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## Credit Pricing

- **Runway Aleph**: 50 credits per regular operation, 75 credits per edit operation

## Environment Variables

- `RUNWAYML_API_KEY`: Your Runway API key (note: use dev.runwayml.com endpoint)
- `S3_BUCKET_NAME`: S3 bucket for storing videos
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `AWS_REGION`: AWS region

## Database Integration

The module uses the existing database models:

- **GeneratedVideo**: Stores video editing metadata
  - `animationPrompt`: The editing prompt
  - `artStyle`: Set to "video-editing"
  - `imageS3Key`: Original video URI
  - `model`: "runway-aleph-{model_name}"
  - `uuid`: Operation ID
  - `success`: Whether the operation completed successfully

- **GeneratedVideoFile**: Stores S3 keys for edited videos
  - `s3Key`: S3 path to the edited video
  - `generatedVideoId`: Reference to GeneratedVideo record

- **ConversationHistory**: Tracks the editing operation
  - `type`: "VIDEO_GENERATION"
  - `userInput`: The editing prompt
  - `metadata`: Contains original video URI, model settings, and Runway task ID

## Error Handling

- **Credit Insufficient**: Returns 400 with credit shortfall information
- **API Key Invalid**: Returns 401 for invalid Runway API key
- **Rate Limited**: Returns 429 when Runway API rate limit is exceeded
- **S3 Upload Failure**: Logs error but doesn't fail the operation
- **Automatic Refunds**: Credits are automatically refunded on operation failures

## Usage Example

```typescript
// Edit a video
const response = await fetch('/video-editing/runway-aleph?projectId=proj_123', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    videoUri: 'https://example.com/input-video.mp4',
    promptText: 'Add snow falling in the background',
    model: 'gen4_aleph',
    ratio: '1280:720'
  })
});

const result = await response.json();
console.log('Operation ID:', result.id);

// Check status
const statusResponse = await fetch(`/video-editing/status/${result.id}`, {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});

const status = await statusResponse.json();
console.log('Status:', status.status);
console.log('S3 Key:', status.s3Key);
```

## Testing

Two test scripts are provided in the backend directory:

### Node.js Test (Recommended)
```bash
cd backend
node test-video-editing.js
```

### Bash Script Test
```bash
cd backend
./test-video-editing.sh test@example.com
```

Both scripts will:
1. Generate a temporary JWT token
2. Create a test project
3. Submit a video editing request (adding aliens to a test video)
4. Monitor progress every 10 seconds until completion
5. Display the final video URLs and S3 keys
6. Show video editing history

The test scripts demonstrate the complete asynchronous workflow and will run until the video editing is fully completed.
