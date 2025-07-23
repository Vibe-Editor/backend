# Image Generation

- `POST /image-gen` - Generate images using AI model handoff (Recraft AI or Google Imagen)
  - **Features**: Intelligent model selection based on content type (realistic vs artistic/text-based)
  - **Models**: Recraft AI for realistic images, Google Imagen for artistic/text content
  - **Example Request**:

  ```json
  {
    "visual_prompt": "A sleek eco-friendly water bottle on a wooden desk with green plants in the background",
    "art_style": "modern minimalist photography",
    "uuid": "segment-001-image",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "s3_key": "images/segment-001-image.jpg",
    "model": "recraft-ai",
    "message": "Image generated successfully",
    "image_size_bytes": 245760
  }
  ```

- `GET /image-gen` - Get all generated images
  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific image by ID
    - `projectId` (optional): Filter images by project
  - **Returns**: Array of all user's generated images

- `PATCH /image-gen/:id` - Update the visual prompt, art style, and/or S3 key of a specific generated image
  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The image ID to update
  - **Body**: `{visual_prompt: string, art_style: string, s3_key?: string}` - The new visual prompt, art style, and optionally S3 key to update
  - **Example Request**:

  ```json
  {
    "visual_prompt": "A sleek eco-friendly water bottle on a wooden desk with green plants in the background, focusing on sustainability and health benefits",
    "art_style": "cinematic photography with soft lighting",
    "s3_key": "images/updated-segment-001-image.jpg"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Image prompt, art style, and S3 key updated successfully",
    "image": {
      "id": "clxyz123abc",
      "visualPrompt": "A sleek eco-friendly water bottle on a wooden desk with green plants in the background, focusing on sustainability and health benefits",
      "artStyle": "cinematic photography with soft lighting",
      "uuid": "segment-001-image",
      "success": true,
      "s3Key": "images/updated-segment-001-image.jpg",
      "model": "recraft-ai",
      "message": null,
      "imageSizeBytes": 245760,
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
