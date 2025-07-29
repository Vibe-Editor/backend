# Video Generation

**Important**: All video-gen endpoints now require a valid `projectId` in the request body. These endpoints will not work without providing a correct project ID.

- `POST /video-gen` - Generate videos using AI model handoff (Google Veo2 or RunwayML Gen-3)
  - **Body Parameters**:
  - `animation_prompt` (required): Description of the animation/movement for the video
  - `art_style` (required): Style of the video to generate
  - `imageS3Key` (required): S3 key of the input image to animate
  - `uuid` (required): Unique identifier for the video generation
  - `projectId` (required): ID of the project to save the video to
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
    "totalVideos": 2,
    "credits": {
      "used": 2.5,
      "balance": 47.5
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
