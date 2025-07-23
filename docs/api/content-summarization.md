# Content Summarization

- `POST /user-input-summarizer` - Get information from the web using Perplexity AI
  - takes in `{original_content: string, user_input: string}` as parameter
  - **Example Request**:

  ```json
  {
    "original_content": "Our company specializes in creating eco-friendly water bottles made from recycled materials...",
    "user_input": "Make it more focused on the health benefits and target young professionals"
  }
  ```

  - returns `{summary: string}`

- `GET /user-input-summarizer` - Get all content summaries
  - **Requires**: JWT Authentication
  - **Query Parameters**:
    - `id` (optional): Get specific summary by ID
    - `projectId` (optional): Filter summaries by project
  - **Returns**: Array of all user's content summaries

- `PATCH /user-input-summarizer/:id` - Update a specific content summary
  - **Requires**: JWT Authentication
  - **URL Parameter**: `id` - The content summary ID to update
  - **Body**: `{original_content?: string, user_input?: string}` - Fields to update (all optional)
  - **Example Request**:

  ```json
  {
    "original_content": "Our company specializes in creating eco-friendly water bottles made from recycled materials with advanced filtration technology...",
    "user_input": "Make it more focused on the health benefits and target young professionals and athletes"
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
      "summary": "A 30-second video showcasing...",
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
