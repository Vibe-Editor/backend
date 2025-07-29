# Segmentation

- `POST /segmentation` - Generate and segment video scripts using AI model handoff (OpenAI GPT-4o or Gemini 2.5 Pro)
  - **Requires**: JWT Authentication
  - **Body Parameters**:
    - `prompt` (required): Description of the video to create
    - `concept` (required): Core concept or focus for the video
    - `negative_prompt` (optional): Things to avoid in the video
    - `projectId` (required): ID of the project to save the segmentation to
  - **Example Request**:

  ```json
  {
    "prompt": "Create a 30-second promotional video showcasing our eco-friendly water bottle",
    "concept": "Focus on sustainability, health benefits, and modern lifestyle",
    "negative_prompt": "Avoid plastic waste imagery, don't show competing brands",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "segments": [
      {
        "id": "seg-1",
        "visual": "Close-up of sleek water bottle on wooden desk with plants",
        "narration": "Meet the future of hydration",
        "animation": "Smooth zoom-in on bottle label"
      },
      {
        "id": "seg-2",
        "visual": "Hand reaching for bottle, natural lighting",
        "narration": "Made from 100% recycled materials",
        "animation": "Hand picks up bottle, gentle rotation"
      }
    ],
    "artStyle": "modern minimalist",
    "model": "gpt-4o",
    "credits": {
      "used": 3,
      "balance": 47.5
    }
  }
  ```

- `GET /segmentation` - Get all video segmentations
  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific segmentation by ID
    - `projectId` (optional): Filter segmentations by project
  - **Returns**: Array of all user's video segmentations

  ```json
  {
    "success": true,
    "count": 2,
    "segmentations": [
      {
        "id": "seg-123",
        "prompt": "Create a 30-second promotional video showcasing our eco-friendly water bottle",
        "concept": "Focus on sustainability, health benefits, and modern lifestyle",
        "negativePrompt": "Avoid plastic waste imagery, don't show competing brands",
        "artStyle": "modern minimalist",
        "model": "gpt-4o",
        "isSelected": false,
        "projectId": "proj123",
        "userId": "user123",
        "createdAt": "2025-01-16T10:30:00Z",
        "project": {
          "id": "proj123",
          "name": "My Video Project"
        },
        "segments": [
          {
            "id": "segment-1",
            "segmentId": "seg-1",
            "visual": "Close-up of sleek water bottle on wooden desk with plants",
            "narration": "Meet the future of hydration",
            "animation": "Smooth zoom-in on bottle label",
            "createdAt": "2025-01-16T10:30:00Z"
          }
        ]
      }
    ]
  }
  ```

- `PATCH /segmentation/:id/select` - Select a segmentation for production
  - **Requires**: JWT Authentication
  - **Purpose**: Mark a specific segmentation as selected (supports multiple selections per project)
  - **Body Parameters**:
    - `projectId` (optional): ID of the project context for selection
  - **Features**:
    - Allows multiple segmentations to be selected throughout project lifecycle
    - Each generation round can have its own selected segmentation
    - Does NOT deselect previous selections
    - Updates `isSelected` field to true for chosen segmentation
  - **Workflow**: Generate 2 parallel requests → User selects 1 → Process repeats with new prompts
  - **Example Request**:

  ```json
  {
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Segmentation selected successfully",
    "segmentation": {
      "id": "seg-2",
      "isSelected": true,
      "segments": [...]
    }
  }
  ```

- `PATCH /segmentation/:id` - Update a specific video segmentation
  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The segmentation ID to update
  - **Body Parameters**:
    - `prompt` (optional): Updated description of the video
    - `concept` (optional): Updated core concept or focus for the video
    - `negative_prompt` (optional): Updated things to avoid in the video
    - `projectId` (optional): Move segmentation to a different project
  - **Example Request**:

  ```json
  {
    "prompt": "Create a 45-second promotional video showcasing our eco-friendly water bottle with lifestyle focus",
    "concept": "Focus on sustainability, health benefits, modern lifestyle, and athletic performance",
    "negative_prompt": "Avoid plastic waste imagery, don't show competing brands, no medical claims",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Segmentation updated successfully",
    "segmentation": {
      "id": "seg-123",
      "prompt": "Create a 45-second promotional video showcasing our eco-friendly water bottle with lifestyle focus",
      "concept": "Focus on sustainability, health benefits, modern lifestyle, and athletic performance",
      "negativePrompt": "Avoid plastic waste imagery, don't show competing brands, no medical claims",
      "artStyle": "modern minimalist",
      "model": "gpt-4o",
      "isSelected": false,
      "projectId": "proj123",
      "userId": "user123",
      "createdAt": "2025-01-16T10:30:00Z",
      "project": {
        "id": "proj123",
        "name": "My Video Project"
      },
      "segments": [
        {
          "id": "segment-1",
          "segmentId": "seg-1",
          "visual": "Close-up of sleek water bottle on wooden desk with plants",
          "narration": "Meet the future of hydration",
          "animation": "Smooth zoom-in on bottle label",
          "createdAt": "2025-01-16T10:30:00Z"
        }
      ]
    }
  }
  ```

## Credit Usage

- **POST /segmentation**: 3 credits per generation
- **GET /segmentation**: Free (no credits deducted)
- **PATCH /segmentation/:id/select**: Free (no credits deducted)
- **PATCH /segmentation/:id**: Free (no credits deducted)

## Error Codes

- **400 Bad Request**: Invalid input (missing required fields)
- **401 Unauthorized**: JWT authentication required
- **404 Not Found**: Segmentation not found or access denied
- **500 Internal Server Error**: AI model errors or database issues
