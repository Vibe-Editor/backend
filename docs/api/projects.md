# Projects

- `POST /projects` - Create new project

  - **Requires**: JWT Authentication
  - **Body**: `{name: string, description?: string}`
  - **Example Request**:

  ```json
  {
    "name": "My Video Project",
    "description": "A promotional video for our product"
  }
  ```

  - **Returns**:

  ```json
  {
    "id": "clxyz123abc",
    "name": "My Video Project",
    "description": "A promotional video for our product",
    "userId": "cluser123",
    "createdAt": "2025-01-16T10:30:00Z",
    "updatedAt": "2025-01-16T10:30:00Z"
  }
  ```

- `GET /projects` - Get all user projects with statistics

  - **Requires**: JWT Authentication
  - **Returns**: Array of projects with content counts

  ```json
  [
    {
      "id": "clxyz123abc",
      "name": "My Video Project",
      "description": "A promotional video",
      "userId": "cluser123",
      "createdAt": "2025-01-16T10:30:00Z",
      "updatedAt": "2025-01-16T10:30:00Z",
      "_count": {
        "conversations": 5,
        "videoConcepts": 2,
        "generatedImages": 8,
        "generatedVideos": 3,
        "generatedVoiceovers": 1
      }
    }
  ]
  ```

- `GET /projects/:id` - Get specific project with statistics

  - **Requires**: JWT Authentication
  - **Returns**: Single project with content counts
  - **Response Format**:

  ```json
  {
    "id": "project_id",
    "name": "Project Name",
    "description": "Project description",
    "userId": "user_id",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "_count": {
      "conversations": 15,
      "videoConcepts": 8,
      "webResearchQueries": 5,
      "contentSummaries": 12,
      "videoSegmentations": 3,
      "generatedImages": 25,
      "generatedVideos": 10,
      "generatedVoiceovers": 7
    }
  }
  ```

- `GET /projects/:id/conversations` - Get paginated conversations for a project

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `page` (optional): Page number, defaults to 1
    - `limit` (optional): Items per page, defaults to 10
  - **Example Request**: `GET /projects/clxyz123abc/conversations?page=1&limit=10`
  - **Response Format**:

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "conv-123",
        "type": "CONCEPT_GENERATION",
        "userInput": {"prompt": "Create a video concept"},
        "response": {"concepts": [...]},
        "metadata": null,
        "projectId": "clxyz123abc",
        "userId": "user123",
        "createdAt": "2025-01-16T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
  ```

  - **Features**:
    - Automatically parses JSON strings in `userInput` and `response` fields
    - Ordered by most recent first (newest first)
    - Validates project ownership before returning data
    - Comprehensive pagination metadata

- `GET /projects/:id/full` - Get complete project data with all content

  - **Requires**: JWT Authentication
  - **Example Request**: `GET /projects/clxyz123abc/full`
  - **Returns**: Project with all foreign keys to videos, images, segmentations, concepts, etc.
  - **Features**: Shows multiple selected segmentations and S3 keys for media files
  - **Response Schema**:

  ```typescript
  {
    success: boolean;
    project: {
      // Basic project info
      id: string;
      name: string;
      description: string | null;
      userId: string;
      createdAt: string; // ISO date
      updatedAt: string; // ISO date

      // Conversations with parsed JSON
      conversations: Array<{
        id: string;
        type:
          | 'CONCEPT_GENERATION'
          | 'WEB_RESEARCH'
          | 'CONTENT_SUMMARY'
          | 'VIDEO_SEGMENTATION'
          | 'IMAGE_GENERATION'
          | 'VIDEO_GENERATION'
          | 'VOICEOVER_GENERATION'
          | 'GENERAL_CHAT';
        userInput: any; // Parsed JSON object
        response: any; // Parsed JSON object
        metadata: any | null; // Optional metadata
        projectId: string;
        userId: string;
        createdAt: string;
      }>;

      // Video concepts
      videoConcepts: Array<{
        id: string;
        prompt: string;
        webInfo: string;
        title: string;
        concept: string;
        tone: string;
        goal: string;
        projectId: string | null;
        userId: string;
        createdAt: string;
      }>;

      // Web research queries
      webResearchQueries: Array<{
        id: string;
        prompt: string;
        response: string;
        projectId: string | null;
        userId: string;
        createdAt: string;
      }>;

      // Content summaries
      contentSummaries: Array<{
        id: string;
        originalContent: string;
        userInput: string;
        summary: string;
        projectId: string | null;
        userId: string;
        createdAt: string;
      }>;

      // Video segmentations with segments (supports multiple selections)
      videoSegmentations: Array<{
        id: string;
        prompt: string;
        concept: string;
        negativePrompt: string | null;
        artStyle: string;
        model: string;
        isSelected: boolean; // Multiple can be true per project
        projectId: string | null;
        userId: string;
        createdAt: string;
        segments: Array<{
          id: string;
          segmentId: string;
          visual: string;
          narration: string;
          animation: string;
          videoSegmentationId: string;
          createdAt: string;
        }>;
      }>;

      // Selected segmentations (convenience field - array of all selected ones)
      selectedSegmentations: Array<{
        id: string;
        prompt: string;
        concept: string;
        negativePrompt: string | null;
        artStyle: string;
        model: string;
        isSelected: true; // Always true
        projectId: string | null;
        userId: string;
        createdAt: string;
        segments: Array<{
          id: string;
          segmentId: string;
          visual: string;
          narration: string;
          animation: string;
          videoSegmentationId: string;
          createdAt: string;
        }>;
      }>;

      // Generated images with S3 keys
      generatedImages: Array<{
        id: string;
        visualPrompt: string;
        artStyle: string;
        uuid: string;
        success: boolean;
        s3Key: string | null; // S3 file path for download
        model: string | null;
        message: string | null;
        imageSizeBytes: number | null;
        projectId: string | null;
        userId: string;
        createdAt: string;
      }>;

      // Generated videos with file arrays
      generatedVideos: Array<{
        id: string;
        animationPrompt: string;
        artStyle: string;
        imageS3Key: string;
        uuid: string;
        success: boolean;
        model: string | null;
        totalVideos: number | null;
        projectId: string | null;
        userId: string;
        createdAt: string;
        videoFiles: Array<{
          id: string;
          s3Key: string; // S3 file path for download
          generatedVideoId: string;
          createdAt: string;
        }>;
      }>;

      // Generated voiceovers
      generatedVoiceovers: Array<{
        id: string;
        narrationPrompt: string;
        s3Key: string; // S3 file path for download
        projectId: string | null;
        userId: string;
        createdAt: string;
      }>;

      // Content statistics
      _count: {
        conversations: number;
        videoConcepts: number;
        webResearchQueries: number;
        contentSummaries: number;
        videoSegmentations: number;
        generatedImages: number;
        generatedVideos: number;
        generatedVoiceovers: number;
      }
    }
  }
  ```

  **Key Features:**

  - **Multiple Segmentation Selections**: Supports iterative workflow where multiple segmentations can be selected per project
  - **Parsed JSON**: Conversation `userInput` and `response` fields are automatically parsed from JSON strings
  - **File References**: All S3 keys for media files (images, videos, audio) are included
  - **Statistics**: Content counts for analytics and progress tracking
  - **Relationships**: Full foreign key relationships with nested data
  - **Chronological Order**: All arrays sorted by creation date (newest first)

- `PATCH /projects/:id` - Update project

  - **Requires**: JWT Authentication
  - **Body**: `{name?: string, description?: string}`
  - **Example Request**:

  ```json
  {
    "name": "Updated Project Name",
    "description": "Updated description for the project"
  }
  ```

  - **Returns**: Updated project data

- `DELETE /projects/:id` - Delete project and all related content

  - **Requires**: JWT Authentication
  - **Note**: Cascade deletes all conversations, concepts, images, videos, etc.
  - **Returns**: Success confirmation

- `GET /projects/:id/concepts` - Get paginated concepts for a project

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `page` (optional): Page number, defaults to 1
    - `limit` (optional): Items per page, defaults to 10
  - **Example Request**: `GET /projects/clxyz123abc/concepts?page=1&limit=10`
  - **Example Response**:

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "clconcept123",
        "prompt": "Create a promotional video for a new eco-friendly water bottle",
        "webInfo": "Latest trends in sustainable products and environmental awareness campaigns",
        "title": "EcoBottle: The Future of Hydration",
        "concept": "A vibrant video showcasing the journey from plastic waste to beautiful, functional water bottle...",
        "tone": "Inspiring and optimistic",
        "goal": "Drive product awareness and environmental consciousness",
        "projectId": "clxyz123abc",
        "userId": "cluser123",
        "createdAt": "2025-01-16T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
  ```

- `GET /projects/:id/images` - Get paginated images for a project

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `page` (optional): Page number, defaults to 1
    - `limit` (optional): Items per page, defaults to 10
  - **Example Request**: `GET /projects/clxyz123abc/images?page=1&limit=10`
  - **Example Response**:

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "climage123",
        "visualPrompt": "A sleek eco-friendly water bottle on a wooden desk with green plants in the background",
        "artStyle": "photorealistic",
        "uuid": "img-uuid-123",
        "success": true,
        "s3Key": "images/segment-001-image.jpg",
        "model": "recraft-ai",
        "message": "Image generated successfully",
        "imageSizeBytes": 245760,
        "projectId": "clxyz123abc",
        "userId": "cluser123",
        "createdAt": "2025-01-16T10:35:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 8,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
  ```

- `GET /projects/:id/videos` - Get paginated videos for a project

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `page` (optional): Page number, defaults to 1
    - `limit` (optional): Items per page, defaults to 10
  - **Example Request**: `GET /projects/clxyz123abc/videos?page=1&limit=10`
  - **Example Response**:

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "clvideo123",
        "animationPrompt": "Camera slowly zooms in on the water bottle while a hand reaches for it, smooth professional movement",
        "artStyle": "cinematic",
        "imageS3Key": "images/segment-001-image.jpg",
        "uuid": "vid-uuid-123",
        "success": true,
        "model": "runway-gen3",
        "totalVideos": 2,
        "projectId": "clxyz123abc",
        "userId": "cluser123",
        "createdAt": "2025-01-16T10:40:00Z",
        "videoFiles": [
          {
            "id": "clvidfile123",
            "s3Key": "videos/segment-001-video-1.mp4",
            "generatedVideoId": "clvideo123",
            "createdAt": "2025-01-16T10:40:00Z"
          },
          {
            "id": "clvidfile124",
            "s3Key": "videos/segment-001-video-2.mp4",
            "generatedVideoId": "clvideo123",
            "createdAt": "2025-01-16T10:40:00Z"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 6,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
  ```

- `GET /projects/:id/voiceovers` - Get paginated voiceovers for a project

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `page` (optional): Page number, defaults to 1
    - `limit` (optional): Items per page, defaults to 10
  - **Example Request**: `GET /projects/clxyz123abc/voiceovers?page=1&limit=10`
  - **Example Response**:

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "clvoice123",
        "narrationPrompt": "Introducing the future of hydration - our new eco-friendly water bottle that's as good for you as it is for the planet.",
        "s3Key": "voiceovers/narration-001.mp3",
        "projectId": "clxyz123abc",
        "userId": "cluser123",
        "createdAt": "2025-01-16T10:45:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 4,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
  ```

- `GET /projects/:id/segmentations` - Get paginated segmentations for a project

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `page` (optional): Page number, defaults to 1
    - `limit` (optional): Items per page, defaults to 10
  - **Example Request**: `GET /projects/clxyz123abc/segmentations?page=1&limit=10`
  - **Example Response**:

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "clseg123",
        "prompt": "Create a 30-second promotional video showcasing our eco-friendly water bottle",
        "concept": "EcoBottle promotional video",
        "negativePrompt": "Avoid plastic waste imagery, no competing brands",
        "artStyle": "cinematic",
        "model": "gpt-4o",
        "isSelected": true,
        "projectId": "clxyz123abc",
        "userId": "cluser123",
        "createdAt": "2025-01-16T10:25:00Z",
        "segments": [
          {
            "id": "clseg123seg1",
            "segmentId": "1",
            "visual": "Close-up shot of the eco-friendly water bottle on a wooden table",
            "narration": "Introducing the future of hydration",
            "animation": "Camera slowly zooms in on the bottle",
            "videoSegmentationId": "clseg123",
            "createdAt": "2025-01-16T10:25:00Z"
          },
          {
            "id": "clseg123seg2",
            "segmentId": "2",
            "visual": "Hands holding the bottle with green plants in background",
            "narration": "Our new eco-friendly water bottle",
            "animation": "Smooth transition from table to hands",
            "videoSegmentationId": "clseg123",
            "createdAt": "2025-01-16T10:25:00Z"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 3,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
  ```

- `GET /projects/:id/summaries` - Get paginated summaries for a project

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `page` (optional): Page number, defaults to 1
    - `limit` (optional): Items per page, defaults to 10
  - **Example Request**: `GET /projects/clxyz123abc/summaries?page=1&limit=10`
  - **Example Response**:

  ```json
  {
    "success": true,
    "data": [
      {
        "id": "clsummary123",
        "originalContent": "Our company specializes in creating eco-friendly water bottles made from recycled materials with advanced filtration technology...",
        "userInput": "Make it more focused on the health benefits and target young professionals",
        "summary": "EcoBottle delivers premium hydration solutions for health-conscious young professionals. Our revolutionary water bottles combine recycled materials with advanced filtration technology, ensuring pure, clean water while supporting environmental sustainability. Perfect for the modern professional lifestyle.",
        "projectId": "clxyz123abc",
        "userId": "cluser123",
        "createdAt": "2025-01-16T10:20:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 2,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
  ```

- `GET /projects/:id/research` - Get paginated web research for a project
  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `page` (optional): Page number, defaults to 1
    - `limit` (optional): Items per page, defaults to 10
  - **Example Request**: `GET /projects/clxyz123abc/research?page=1&limit=10`
  - **Example Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "clresearch123",
        "prompt": "What are the latest trends in sustainable packaging for 2025?",
        "response": "Based on current market analysis, the top sustainable packaging trends for 2025 include: 1) Biodegradable materials made from seaweed and mushroom-based compounds, 2) Zero-waste packaging designs that eliminate single-use components, 3) Smart packaging with embedded sensors for freshness tracking, 4) Refillable container systems for consumer products, 5) Plant-based plastic alternatives derived from agricultural waste. These trends are driven by increasing consumer environmental awareness and stricter regulatory requirements across global markets.",
        "projectId": "clxyz123abc",
        "userId": "cluser123",
        "createdAt": "2025-01-16T10:15:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 3,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
  ```

**Pagination Response Format**: All paginated endpoints return the same consistent format:

```json
{
  "success": true,
  "data": [...], // Array of items
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```
