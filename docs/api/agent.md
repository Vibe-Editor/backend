# Agent API

The Agent API provides AI-powered content generation through a structured workflow that includes web research, concept generation, and user approval processes.

## Overview

The Agent API follows a mandatory 3-step workflow:

1. **Web Research**: Gathers relevant information using the `get_web_info` tool
2. **Concept Generation**: Creates 3-4 creative concepts using the `generate_concepts_with_approval` tool
3. **User Approval**: Presents concepts for user selection through a human-in-the-loop approval system

## Base URL

```
POST /agent/run
```

## Authentication

Requires JWT Bearer token in the Authorization header.

## Request

### Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Request Body

```json
{
  "prompt": "string",
  "segmentId": "string",
  "projectId": "string"
}
```

#### Parameters

| Parameter   | Type   | Required | Description                               |
| ----------- | ------ | -------- | ----------------------------------------- |
| `prompt`    | string | Yes      | The user's request for content generation |
| `segmentId` | string | Yes      | Unique identifier for the segment         |
| `projectId` | string | Yes      | Unique identifier for the project         |

### Example Request

```json
{
  "prompt": "An advertisement for a face wash",
  "segmentId": "cmdolljnu0003k7k15o4bot6f",
  "projectId": "cmdojbl3j0002k78ra4p0r83n"
}
```

## Response

The API returns a **Server-Sent Events (SSE) stream** with different message types during the workflow execution.

### Response Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### Stream Message Types

#### 1. Log Messages

Provides status updates during execution.

```json
{
  "type": "log",
  "data": {
    "message": "Starting agent run..."
  },
  "timestamp": "2025-08-07T07:24:36.356Z"
}
```

#### 2. Approval Required

Triggered when the agent needs user approval for concept selection.

```json
{
  "type": "approval_required",
  "data": {
    "approvalId": "approval_1754551476356_pvww456cf",
    "toolName": "generate_concepts_with_approval",
    "arguments": "{\"prompt\":\"An advertisement for a face wash\",\"web_info\":\"...\",\"projectId\":\"cmdojbl3j0002k78ra4p0r83n\",\"userId\":\"cmdoj92mn0000k78r6hj9rfhg\"}",
    "agentName": "Content Generation Agent"
  },
  "timestamp": "2025-08-07T07:24:36.356Z"
}
```

##### Approval Data Structure

| Field        | Type   | Description                                |
| ------------ | ------ | ------------------------------------------ |
| `approvalId` | string | Unique identifier for the approval request |
| `toolName`   | string | Name of the tool requiring approval        |
| `arguments`  | string | JSON string containing tool parameters     |
| `agentName`  | string | Name of the requesting agent               |

#### 3. Result Messages

Contains the generated concepts after approval.

```json
{
  "type": "result",
  "data": {
    "success": true,
    "data": {
      "concepts": [
        {
          "concept": "A visually dynamic sequence that opens with a close-up of various common skin aggressors...",
          "goal": "To position the face wash as a powerful and essential daily defense...",
          "title": "Unmask Your Best Self: The Daily Defense",
          "tone": "Empowering, transformative, slightly heroic"
        }
      ],
      "credits": {
        "used": 1,
        "balance": 63
      }
    },
    "message": "Concepts generated successfully"
  },
  "timestamp": "2025-08-07T07:25:04.270Z"
}
```

##### Concept Structure

| Field     | Type   | Description                         |
| --------- | ------ | ----------------------------------- |
| `concept` | string | Detailed description of the concept |
| `goal`    | string | What the concept aims to achieve    |
| `title`   | string | Title of the concept                |
| `tone`    | string | The tone/style of the concept       |

##### Credits Structure

| Field     | Type   | Description                |
| --------- | ------ | -------------------------- |
| `used`    | number | Number of credits consumed |
| `balance` | number | Remaining credit balance   |

#### 4. Completion Messages

Indicates the end of the agent run.

```json
{
  "type": "completed",
  "data": {
    "message": "Agent run completed successfully"
  },
  "timestamp": "2025-08-07T07:25:04.270Z"
}
```

#### 5. Error Messages

Returned when an error occurs during execution.

```json
{
  "type": "error",
  "data": {
    "message": "Error description"
  },
  "timestamp": "2025-08-07T07:25:04.270Z"
}
```

## Approval Workflow

### Step 1: Handle Approval Request

When you receive an `approval_required` message, use the approval endpoint to approve or reject:

**Endpoint**: `POST /agent/approval`

**Request Body**:

```json
{
  "approvalId": "string",
  "approved": boolean
}
```

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `approvalId` | string | Yes | The approval ID from the approval_required message |
| `approved` | boolean | Yes | `true` to approve, `false` to reject |

**Response**:

```json
{
  "status": "success",
  "message": "Request approved successfully"
}
```

### Step 2: Concept Selection

After approval, the agent generates concepts and presents them for selection. The user should select one of the generated concepts by index (0-3).

### Approval Examples

#### Approve a Request

```bash
curl -X POST http://localhost:8080/agent/approval \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalId": "approval_1754551476356_pvww456cf",
    "approved": true
  }'
```

#### Reject a Request

```bash
curl -X POST http://localhost:8080/agent/approval \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalId": "approval_1754551476356_pvww456cf",
    "approved": false
  }'
```

Both requests return:

```json
{
  "status": "success",
  "message": "Request approved successfully"
}
```

_Note: The message will say "approved" or "rejected" based on the action taken._

## Complete Workflow Example

### 1. Initial Request

```bash
curl -X POST https://backend.usuals.ai/agent/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An advertisement for a face wash",
    "segmentId": "cmdolljnu0003k7k15o4bot6f",
    "projectId": "cmdojbl3j0002k78ra4p0r83n"
  }'
```

### 2. Stream Response Flow

```
→ {"type": "log", "data": {"message": "Starting agent run..."}}
→ {"type": "log", "data": {"message": "Agent is processing your request..."}}
→ {"type": "approval_required", "data": {"approvalId": "approval_123", ...}}
→ {"type": "log", "data": {"message": "Approval received, continuing execution..."}}
→ {"type": "log", "data": {"message": "Generating concepts..."}}
→ {"type": "result", "data": {"success": true, "data": {"concepts": [...]}}}
→ {"type": "completed", "data": {"message": "Agent run completed successfully"}}
```

### 3. Handle Approval

```bash

curl -X POST http://localhost:8080/agent/approval \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalId": "approval_1754551476356_pvww456cf",
    "approved": true
  }'
```

**Response**:

```json
{
  "status": "success",
  "message": "Request approved successfully"
}
```

## Error Handling

### Common Error Responses

#### 401 Unauthorized

```json
{
  "message": "Invalid or expired token",
  "error": "Unauthorized",
  "statusCode": 401
}
```

#### 400 Bad Request

```json
{
  "message": "Validation failed",
  "error": "Bad Request",
  "statusCode": 400
}
```

#### 500 Internal Server Error

```json
{
  "type": "error",
  "data": {
    "message": "Internal server error description"
  },
  "timestamp": "2025-08-07T07:25:04.270Z"
}
```

## Rate Limiting

The Agent API consumes credits from the user's balance. Each concept generation typically consumes 1 credit.

## Notes

- The API uses Server-Sent Events (SSE) for real-time streaming
- All requests require valid JWT authentication
- The approval workflow is mandatory for concept generation
- Credits are deducted upon successful concept generation
- The agent follows a strict 3-step workflow that cannot be bypassed
