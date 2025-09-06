# Summary Feature API

The Summary feature provides AI-generated summaries for video concepts and segments using Gemini Flash for fast processing.

## Overview

- **Automatic Generation**: Summaries are automatically generated when creating concepts or segments
- **Independent Management**: CRUD operations for managing summaries independently
- **Credit Integration**: Summary generation consumes credits and is tracked in the credit system
- **Project Association**: Summaries can be associated with specific projects

## Endpoints

### Generate Summary

`POST /summaries/generate` - Generate a summary using AI

- **Requires**: JWT Authentication
- **Body Parameters**:
  - `content` (required): The content to summarize
  - `contentType` (required): Type of content - "concept" or "segment"
  - `projectId` (optional): ID of the project to associate with
- **Example Request**:

```json
{
  "content": "Title: Amazing Product Demo\nConcept: A dynamic video showcasing our new product features...",
  "contentType": "concept",
  "projectId": "clxyz123abc"
}
```

- **Example Response**:

```json
{
  "success": true,
  "summary": "An engaging product demonstration video highlighting key features and benefits...",
  "contentType": "concept"
}
```

### Create Summary Record

`POST /summaries` - Create a summary record in the database

- **Requires**: JWT Authentication
- **Body Parameters**:
  - `content` (required): The original content
  - `summary` (required): The summary text
  - `contentType` (required): Type of content - "concept" or "segment"
  - `projectId` (optional): ID of the project to associate with
  - `relatedId` (optional): ID of the related concept or segment
- **Example Request**:

```json
{
  "content": "Title: Amazing Product Demo\nConcept: A dynamic video...",
  "summary": "An engaging product demonstration video...",
  "contentType": "concept",
  "projectId": "clxyz123abc",
  "relatedId": "concept_123"
}
```

### Get Summaries

`GET /summaries` - Get all summaries for the authenticated user

- **Requires**: JWT Authentication
- **Query Parameters**:
  - `id` (optional): Get specific summary by ID
  - `projectId` (optional): Filter summaries by project
- **Example Response**:

```json
{
  "success": true,
  "count": 5,
  "summaries": [
    {
      "id": "summary_123",
      "originalContent": "Title: Amazing Product Demo...",
      "summary": "An engaging product demonstration video...",
      "contentType": "concept",
      "projectId": "clxyz123abc",
      "userId": "user_123",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "project": {
        "id": "clxyz123abc",
        "name": "My Project"
      }
    }
  ]
}
```

### Update Summary

`PATCH /summaries/:id` - Update a specific summary

- **Requires**: JWT Authentication
- **URL Parameter**: `id` - The summary ID to update
- **Body Parameters**:
  - `content` (optional): Updated original content
  - `summary` (optional): Updated summary text
  - `projectId` (optional): Move summary to a different project
- **Example Request**:

```json
{
  "summary": "Updated summary text...",
  "projectId": "clxyz456def"
}
```

### Delete Summary

`DELETE /summaries/:id` - Delete a specific summary

- **Requires**: JWT Authentication
- **URL Parameter**: `id` - The summary ID to delete
- **Example Response**:

```json
{
  "success": true,
  "message": "Summary deleted successfully"
}
```

## Automatic Summary Generation

### Concept Creation

When creating video concepts via `POST /concept-writer`, summaries are automatically generated and included in the response:

```json
{
  "concepts": [
    {
      "title": "Amazing Product Demo",
      "concept": "A dynamic video showcasing our new product features...",
      "tone": "Professional and engaging",
      "goal": "Drive product adoption",
      "summary": "An engaging product demonstration video highlighting key features and benefits..."
    }
  ],
  "credits": {
    "used": 1,
    "balance": 49
  }
}
```

### Segment Creation

When creating video segments via `POST /segmentation`, a combined summary for all segments is automatically generated and included in the response:

```json
{
  "segments": [
    {
      "id": "segment_123",
      "visual": "Close-up shot of product features",
      "narration": "Our product offers advanced capabilities...",
      "animation": "Smooth zoom and pan effects"
    },
    {
      "id": "segment_456",
      "visual": "Wide shot showing product in use",
      "narration": "See how our customers benefit...",
      "animation": "Fade transitions between scenarios"
    }
  ],
  "summary": "A comprehensive product demonstration video featuring dynamic visual transitions, customer testimonials, and smooth animations that showcase key features and benefits",
  "artStyle": "Modern and clean",
  "model": "gemini-2.5-flash",
  "credits": {
    "used": 3,
    "balance": 46
  }
}
```

## Credit System Integration

- **Summary Generation**: Each summary generation consumes credits (typically 0.5-1 credit)
- **Credit Tracking**: All summary operations are tracked in the credit transaction system
- **Error Handling**: Credits are refunded if summary generation fails
- **Transaction History**: Summary operations appear in the user's credit transaction history

## Error Handling

- **Graceful Degradation**: If summary generation fails, the main operation continues without the summary
- **User Isolation**: Users can only access their own summaries
- **Validation**: All input is validated using class-validator decorators
- **Logging**: Comprehensive logging for debugging and monitoring

## Performance

- **Fast AI Processing**: Uses Gemini Flash for quick summary generation
- **Modular Design**: Reusable summary service across all modules
- **Efficient Database Queries**: Optimized queries with proper indexing
- **Credit Efficiency**: Minimal credit usage for summary operations
