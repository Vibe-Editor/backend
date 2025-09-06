# Concept Generation

**Important**: All concept-writer endpoints now require a valid `projectId` in the request body. These endpoints will not work without providing a correct project ID.

- `POST /concept-writer` - Generate creative video concepts

  - **Requires**: JWT Authentication
  - **Body Parameters**:
    - `prompt` (required): Description of the video concept to generate
    - `web_info` (required): Latest information or context about the topic
    - `projectId` (required): ID of the project to save the concepts to
  - **Example Request**:

  ```json
  {
    "prompt": "Create a promotional video for a new eco-friendly water bottle",
    "web_info": "Latest trends in sustainable products and environmental awareness campaigns",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "concepts": [
      {
        "title": "Eco Revolution",
        "concept": "A 30-second video showcasing the journey from plastic waste to pure hydration",
        "tone": "inspirational and modern",
        "goal": "increase brand awareness and environmental consciousness"
      }
    ],
    "credits": {
      "used": 1,
      "balance": 49.0
    }
  }
  ```

- `GET /concept-writer` - Get all generated video concepts

  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific concept by ID
    - `projectId` (optional): Filter concepts by project
  - **Returns**: Array of all user's video concepts across projects or specific concept

  ```json
  [
    {
      "id": "clxyz123abc",
      "prompt": "Create a promotional video for a new eco-friendly water bottle",
      "webInfo": "Latest trends in sustainable products...",
      "title": "Eco-Friendly Water Bottle Promo",
      "concept": "A 30-second video showcasing...",
      "tone": "inspirational and modern",
      "goal": "increase brand awareness",
      "projectId": "proj123",
      "userId": "user123",
      "createdAt": "2025-01-16T10:30:00Z"
    }
  ]
  ```

- `PATCH /concept-writer/:id` - Update a specific video concept

  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The concept ID to update
  - **Body Parameters**:
    - `prompt` (required): Updated description of the video concept
    - `projectId` (optional): Move concept to a different project
  - **Example Request**:

  ```json
  {
    "prompt": "Create a promotional video for an eco-friendly water bottle focusing on health benefits for athletes",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Concept prompt updated successfully",
    "concept": {
      "id": "clxyz123abc",
      "prompt": "Create a promotional video for an eco-friendly water bottle focusing on health benefits for athletes",
      "webInfo": "Latest trends in sustainable products...",
      "title": "Eco-Friendly Water Bottle Promo",
      "concept": "A 30-second video showcasing...",
      "tone": "inspirational and modern",
      "goal": "increase brand awareness",
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
