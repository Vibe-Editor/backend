# Content Summarization

**Important**: All user-input-summarizer endpoints now require a valid `projectId` in the request body. These endpoints will not work without providing a correct project ID.

- `POST /user-input-summarizer` - Summarize content based on user input
  - **Requires**: JWT Authentication
  - **Body Parameters**:
    - `original_content` (required): The original content to summarize
    - `user_input` (required): User instructions for how to modify/focus the summary
    - `projectId` (required): ID of the project to save the summary to
  - **Example Request**:

  ```json
  {
    "original_content": "Our company specializes in creating eco-friendly water bottles made from recycled materials...",
    "user_input": "Make it more focused on the health benefits and target young professionals",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "summary": "A comprehensive summary focused on health benefits for young professionals...",
    "credits": {
      "used": 1,
      "balance": 49.0
    }
  }
  ```

- `GET /user-input-summarizer` - Get all content summaries
  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific summary by ID
    - `projectId` (optional): Filter summaries by project
  - **Returns**: Array of all user's content summaries

- `PATCH /user-input-summarizer/:id` - Update a specific content summary
  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The content summary ID to update
  - **Body Parameters**:
    - `original_content` (optional): Updated original content
    - `user_input` (optional): Updated user instructions
    - `projectId` (optional): Move summary to a different project
  - **Example Request**:

  ```json
  {
    "original_content": "Our company specializes in creating eco-friendly water bottles made from recycled materials with advanced filtration technology...",
    "user_input": "Make it more focused on the health benefits and target young professionals and athletes",
    "projectId": "clxyz123abc"
  }
  ```

  - **Example Response**:

  ```json
  {
    "success": true,
    "message": "Content summary updated successfully",
    "summary": {
      "id": "clxyz123abc",
      "originalContent": "Our company specializes in creating eco-friendly water bottles made from recycled materials with advanced filtration technology...",
      "userInput": "Make it more focused on the health benefits and target young professionals and athletes",
      "summary": "A comprehensive summary focused on health benefits for young professionals and athletes...",
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
