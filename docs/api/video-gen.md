# Video Generation

**Important**: All video-gen endpoints now require a valid `projectId` in the request body. These endpoints will not work without providing a correct project ID.

- `POST /video-gen` - Generate videos using AI model handoff (Google Veo2 or RunwayML Gen-3)

  - **Body Parameters**:
  - `animation_prompt` (required): Description of the animation/movement for the video
  - `art_style` (required): Style of the video to generate
  - `imageS3Key` (required): S3 key of the input image to animate
  - `segmentId` (required): Unique identifier for the video generation
  - `projectId` (required): ID of the project to save the video to

## Model Selection

The system automatically selects the best model based on your prompt:

- **Veo2** (25 credits): Cartoonish, animated, stylized content
- **Veo3** (37.5 credits): Ultra-high quality, professional content
- **RunwayML** (2.5 credits): Realistic, photographic content
- **Kling** (20 credits): Cinematic, fluid motion content

### Example Requests

**For Professional/Commercial Content (will use Veo3):**
```json
{
  "animation_prompt": "A professional cinematic scene with smooth camera movement, high-quality lighting, and detailed motion. This should showcase ultra-high quality capabilities for professional video production.",
  "art_style": "cinematic, professional, high-quality",
  "imageS3Key": "images/segment-001-image.jpg",
  "segmentId": "segment-001-video",
  "projectId": "clxyz123abc"
}
```

**For Realistic Content (will use RunwayML):**
```json
{
  "animation_prompt": "Camera slowly zooms in on the water bottle while a hand reaches for it, smooth professional movement",
  "art_style": "cinematic realistic",
  "imageS3Key": "images/segment-001-image.jpg",
  "segmentId": "segment-001-video",
  "projectId": "clxyz123abc"
}
```

**For Animated Content (will use Veo2):**
```json
{
  "animation_prompt": "A cartoon character jumping and spinning with colorful effects and smooth animation",
  "art_style": "cartoon, animated, colorful",
  "imageS3Key": "images/segment-001-image.jpg",
  "segmentId": "segment-001-video",
  "projectId": "clxyz123abc"
}
```

## Response Examples

**Veo3 Response (Professional Content):**
```json
{
  "success": true,
  "s3Keys": [
    "videos/segment-001-video-1.mp4"
  ],
  "model": "veo3",
  "animation_prompt": "A professional cinematic scene with smooth camera movement...",
  "art_style": "cinematic, professional, high-quality",
  "imageS3Key": "images/segment-001-image.jpg",
  "totalVideos": 1,
  "credits": {
    "used": 37.5,
    "balance": 62.5
  }
}
```

**RunwayML Response (Realistic Content):**
```json
{
  "success": true,
  "s3Keys": [
    "videos/segment-001-video-1.mp4",
    "videos/segment-001-video-2.mp4"
  ],
  "model": "runwayml",
  "animation_prompt": "Camera slowly zooms in on the water bottle...",
  "art_style": "cinematic realistic",
  "imageS3Key": "images/segment-001-image.jpg",
  "totalVideos": 2,
  "credits": {
    "used": 2.5,
    "balance": 97.5
  }
}
```

**Veo2 Response (Animated Content):**
```json
{
  "success": true,
  "s3Keys": [
    "videos/segment-001-video-1.mp4"
  ],
  "model": "veo2",
  "animation_prompt": "A cartoon character jumping and spinning...",
  "art_style": "cartoon, animated, colorful",
  "imageS3Key": "images/segment-001-image.jpg",
  "totalVideos": 1,
  "credits": {
    "used": 25,
    "balance": 75
  }
}
```

- `GET /video-gen` - Get all generated videos

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific video by ID
    - `projectId` (optional): Filter videos by project
  - **Returns**: Array of all user's generated videos

- `PATCH /video-gen/:id` - Update a specific generated video

  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The video ID to update
  - **Body Parameters**:
    - `animation_prompt` (required): Updated description of the animation/movement
    - `art_style` (required): Updated style of the video
    - `image_s3_key` (optional): Updated S3 key of the input image
    - `video_s3_keys` (optional): Updated S3 keys of the output videos
    - `projectId` (optional): Move video to a different project
  - **Example Request**:

  ```json
  {
    "animation_prompt": "Camera slowly zooms in on the water bottle while a hand reaches for it, emphasizing the health benefits with smooth professional movement and soft lighting",
    "art_style": "cinematic realistic with dramatic lighting",
    "image_s3_key": "images/updated-segment-001-image.jpg",
    "video_s3_keys": [
      "videos/updated-segment-001-video-1.mp4",
      "videos/updated-segment-001-video-2.mp4"
    ],
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Video updated successfully",
    "video": {
      "id": "clxyz123abc",
      "animationPrompt": "Camera slowly zooms in on the water bottle while a hand reaches for it, emphasizing the health benefits with smooth professional movement and soft lighting",
      "artStyle": "cinematic realistic with dramatic lighting",
      "imageS3Key": "images/updated-segment-001-image.jpg",
      "uuid": "segment-001-video",
      "success": true,
      "model": "runwayml-gen3",
      "totalVideos": 2,
      "projectId": "proj123",
      "userId": "user123",
      "createdAt": "2025-01-16T10:30:00Z",
      "project": {
        "id": "proj123",
        "name": "My Video Project"
      },
      "videoFiles": [
        {
          "id": "file1",
          "s3Key": "videos/updated-segment-001-video-1.mp4",
          "generatedVideoId": "clxyz123abc",
          "createdAt": "2025-01-16T10:30:00Z"
        },
        {
          "id": "file2",
          "s3Key": "videos/updated-segment-001-video-2.mp4",
          "generatedVideoId": "clxyz123abc",
          "createdAt": "2025-01-16T10:30:00Z"
        }
      ]
    }
  }
  ```

## Frontend Integration Guide

### JavaScript/TypeScript Example

```javascript
// Video Generation Service
class VideoGenerationService {
  constructor(apiBaseUrl, authToken) {
    this.apiBaseUrl = apiBaseUrl;
    this.authToken = authToken;
  }

  async generateVideo(videoData) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/video-gen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(videoData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Video generation failed:', error);
      throw error;
    }
  }

  async getVideos(projectId = null) {
    const url = projectId 
      ? `${this.apiBaseUrl}/video-gen?projectId=${projectId}`
      : `${this.apiBaseUrl}/video-gen`;
      
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      }
    });

    return await response.json();
  }
}

// Usage Examples
const videoService = new VideoGenerationService('https://your-api.com', 'your-jwt-token');

// Generate professional video (will use Veo3)
const professionalVideo = await videoService.generateVideo({
  animation_prompt: "A professional cinematic scene with smooth camera movement, high-quality lighting, and detailed motion for commercial use",
  art_style: "cinematic, professional, high-quality",
  imageS3Key: "images/your-image.jpg",
  segmentId: "professional-video-001",
  projectId: "your-project-id"
});

// Generate realistic video (will use RunwayML)
const realisticVideo = await videoService.generateVideo({
  animation_prompt: "Camera slowly zooms in on the product with smooth professional movement",
  art_style: "cinematic realistic",
  imageS3Key: "images/your-image.jpg",
  segmentId: "realistic-video-001",
  projectId: "your-project-id"
});

// Generate animated video (will use Veo2)
const animatedVideo = await videoService.generateVideo({
  animation_prompt: "A cartoon character jumping and spinning with colorful effects",
  art_style: "cartoon, animated, colorful",
  imageS3Key: "images/your-image.jpg",
  segmentId: "animated-video-001",
  projectId: "your-project-id"
});
```

### React Hook Example

```jsx
import { useState, useCallback } from 'react';

export const useVideoGeneration = (apiBaseUrl, authToken) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const generateVideo = useCallback(async (videoData) => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/video-gen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(videoData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setIsGenerating(false);
      return result;
    } catch (err) {
      setError(err.message);
      setIsGenerating(false);
      throw err;
    }
  }, [apiBaseUrl, authToken]);

  return { generateVideo, isGenerating, error };
};

// Usage in Component
const VideoGenerator = () => {
  const { generateVideo, isGenerating, error } = useVideoGeneration(
    'https://your-api.com', 
    'your-jwt-token'
  );

  const handleGenerateVideo = async () => {
    try {
      const result = await generateVideo({
        animation_prompt: "Professional cinematic scene with smooth camera movement",
        art_style: "cinematic, professional, high-quality",
        imageS3Key: "images/your-image.jpg",
        segmentId: `video-${Date.now()}`,
        projectId: "your-project-id"
      });

      console.log('Video generated:', result);
      // Handle success (show video, update UI, etc.)
    } catch (err) {
      console.error('Generation failed:', err);
      // Handle error
    }
  };

  return (
    <div>
      <button 
        onClick={handleGenerateVideo} 
        disabled={isGenerating}
      >
        {isGenerating ? 'Generating...' : 'Generate Video'}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
};
```

### Credit Management

```javascript
// Check user credits before generation
const checkCredits = async () => {
  const response = await fetch(`${apiBaseUrl}/credits/balance`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  const { balance } = await response.json();
  
  // Veo3 costs 37.5 credits (most expensive)
  if (balance < 37.5) {
    throw new Error('Insufficient credits for video generation');
  }
  
  return balance;
};

// Handle credit updates after generation
const handleVideoGeneration = async (videoData) => {
  try {
    const result = await generateVideo(videoData);
    
    // Update UI with new credit balance
    updateCreditBalance(result.credits.balance);
    
    // Show success message with model used
    showSuccessMessage(`Video generated using ${result.model} (${result.credits.used} credits)`);
    
    return result;
  } catch (error) {
    if (error.message.includes('Insufficient credits')) {
      showCreditPurchaseModal();
    }
    throw error;
  }
};
```

### Error Handling

```javascript
const handleVideoGenerationError = (error) => {
  if (error.message.includes('Insufficient credits')) {
    return 'Not enough credits. Please purchase more credits to continue.';
  }
  
  if (error.message.includes('quota') || error.message.includes('limit')) {
    return 'API quota exceeded. Please try again later.';
  }
  
  if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
    return 'Authentication failed. Please log in again.';
  }
  
  if (error.message.includes('Exhausted balance')) {
    return 'Service temporarily unavailable. Please try again later.';
  }
  
  return 'Video generation failed. Please try again.';
};
```

## Model Selection Tips

### To Use Veo3 (37.5 credits):
- Use keywords: "professional", "commercial", "ultra-high quality", "cinematic"
- Describe complex scenes with detailed motion
- Mention professional/commercial applications

### To Use RunwayML (2.5 credits):
- Use keywords: "realistic", "photographic", "human subjects", "real-world"
- Describe realistic scenes and movements
- Focus on documentary or marketing content

### To Use Veo2 (25 credits):
- Use keywords: "cartoon", "animated", "stylized", "artistic"
- Describe non-realistic, creative content
- Focus on artistic or experimental styles

### To Use Kling (20 credits):
- Use keywords: "cinematic", "fluid motion", "professional video"
- Describe smooth, cinematic movements
- Focus on high-quality video production
