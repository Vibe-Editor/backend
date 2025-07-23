# Video Generation

- `POST /video-gen` - Generate videos using AI model handoff (Google Veo2 or RunwayML Gen-3)
  - **Features**: Intelligent model selection based on content style (cartoonish vs realistic)
  - **Models**: Google Veo2 for animated/cartoon content, RunwayML Gen-3 Alpha Turbo for realistic content
  - **Example Request**:

  ```json
  {
    "animation_prompt": "Camera slowly zooms in on the water bottle while a hand reaches for it, smooth professional movement",
    "art_style": "cinematic realistic",
    "imageS3Key": "images/segment-001-image.jpg",
    "uuid": "segment-001-video",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "s3Keys": [
      "videos/segment-001-video-1.mp4",
      "videos/segment-001-video-2.mp4"
    ],
    "model": "runwayml-gen3",
    "totalVideos": 2
  }
  ```

- `GET /video-gen` - Get all generated videos
  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific video by ID
    - `projectId` (optional): Filter videos by project
  - **Returns**: Array of all user's generated videos

- `PATCH /video-gen/:id` - Update the animation prompt, art style, input image S3 key, and/or output video S3 keys of a specific generated video
  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The video ID to update
  - **Body**: `{animation_prompt: string, art_style: string, image_s3_key?: string, video_s3_keys?: string[]}` - The new animation prompt, art style, and optionally input image S3 key and/or output video S3 keys to update
  - **Example Request**:

  ```json
  {
    "animation_prompt": "Camera slowly zooms in on the water bottle while a hand reaches for it, emphasizing the health benefits with smooth professional movement and soft lighting",
    "art_style": "cinematic realistic with dramatic lighting",
    "image_s3_key": "images/updated-segment-001-image.jpg",
    "video_s3_keys": [
      "videos/updated-segment-001-video-1.mp4",
      "videos/updated-segment-001-video-2.mp4"
    ]
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Video prompt, art style, and S3 keys updated successfully",
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
