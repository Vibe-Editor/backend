# Web Research

**Important**: All get-web-info endpoints now require a valid `projectId` in the request body. These endpoints will not work without providing a correct project ID.

- `POST /get-web-info` - Get information from the web using Perplexity AI
  - **Requires**: JWT Authentication
  - **Body Parameters**:
    - `prompt` (required): Research query to ask Perplexity AI
    - `projectId` (required): ID of the project to save the research to
  - **Example Request**:

  ```json
  {
    "prompt": "What are the latest trends in sustainable packaging for 2025?",
    "projectId": "clxyz123abc"
  }
  ```

  - **Returns**: Response from Perplexity AI's chat completion API

- `GET /get-web-info` - Get all web research results
  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific research result by ID
    - `projectId` (optional): Filter research by project
  - **Returns**: Array of all user's research queries and responses

- `PATCH /get-web-info/:id` - Update a specific web research query
  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The web research query ID to update
  - **Body Parameters**:
    - `prompt` (required): Updated research query
    - `projectId` (optional): Move research query to a different project
  - **Example Request**:

  ```json
  {
    "prompt": "What are the latest trends in sustainable packaging for 2025, specifically focusing on biodegradable materials?",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Web info query updated successfully",
    "webInfoQuery": {
      "id": "clxyz123abc",
      "prompt": "What are the latest trends in sustainable packaging for 2025, specifically focusing on biodegradable materials?",
      "response": {
        "id": "response-id",
        "object": "chat.completion",
        "created": 1642765890,
        "model": "sonar",
        "choices": [
          {
            "index": 0,
            "finish_reason": "stop",
            "message": {
              "role": "assistant",
              "content": "Based on the latest research, biodegradable packaging trends for 2025 include..."
            }
          }
        ]
      },
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
