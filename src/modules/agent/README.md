# Agent Module with Human-in-the-Loop Approval

This module implements an AI agent using the OpenAI Agents SDK that integrates with your segmentation and chat endpoints, featuring human-in-the-loop approval for image generation.

## Features

- **Segmentation Tool**: Fetches segmentation data from your backend
- **Chat Tool**: Generates content through your chat endpoints
- **Image Generation with Approval**: Requires user approval before generating images
- **Frontend Integration**: Handles approval/rejection requests from the frontend

## Available Tools

### 1. `get_segmentation`
- **Purpose**: Fetch segmentation data by ID or get all segmentations for a project
- **Parameters**: `segmentationId?`, `projectId?`, `userId`
- **Approval Required**: No

### 2. `chat`
- **Purpose**: Send chat messages to generate content
- **Parameters**: `model`, `gen_type`, `visual_prompt?`, `animation_prompt?`, `image_s3_key?`, `art_style`, `segmentId`, `projectId`, `userId`
- **Approval Required**: No

### 3. `generate_image_with_approval`
- **Purpose**: Generate images after user approval
- **Parameters**: `script`, `art_style`, `segmentId`, `projectId`, `userId`, `model`
- **Approval Required**: Yes

## API Endpoints

### 1. Start Agent Run
```http
POST /agent/run
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "userInput": "Generate an image for a space exploration video"
}
```

**Response:**
```json
{
  "runId": "run_1234567890_abc123",
  "status": "pending_approval",
  "approvalRequests": [
    {
      "id": "approval_1234567890_xyz789",
      "agentName": "Content Generation Agent",
      "toolName": "generate_image_with_approval",
      "arguments": {
        "script": "A beautiful space scene with stars and planets",
        "art_style": "realistic",
        "segmentId": "seg_123",
        "projectId": "proj_456"
      },
      "status": "pending",
      "timestamp": "2024-01-01T12:00:00.000Z"
    }
  ],
  "message": "Agent run requires user approval to continue"
}
```

### 2. Handle Approval
```http
POST /agent/approval
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "approvalId": "approval_1234567890_xyz789",
  "approved": true
}
```

**Response:**
```json
{
  "status": "completed",
  "finalOutput": {
    "success": true,
    "data": { /* generated content */ },
    "message": "Image generation completed successfully"
  },
  "message": "Agent run completed successfully after approval"
}
```

### 3. Get Pending Approvals
```http
GET /agent/approvals/pending
Authorization: Bearer <jwt_token>
```

### 4. Get Specific Approval Request
```http
GET /agent/approvals/:approvalId
Authorization: Bearer <jwt_token>
```

### 5. Cleanup Old Approvals
```http
POST /agent/cleanup
Authorization: Bearer <jwt_token>
```

## Frontend Integration

### 1. Start an Agent Run
```javascript
const response = await fetch('/agent/run', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userInput: 'Generate an image for a marketing campaign'
  })
});

const result = await response.json();

if (result.status === 'pending_approval') {
  // Show approval UI to user
  showApprovalDialog(result.approvalRequests);
}
```

### 2. Handle User Approval
```javascript
async function handleApproval(approvalId, approved) {
  const response = await fetch('/agent/approval', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      approvalId,
      approved
    })
  });

  const result = await response.json();
  
  if (result.status === 'completed') {
    // Show final result
    showResult(result.finalOutput);
  } else if (result.status === 'pending_approval') {
    // Show next approval request
    showApprovalDialog(result.approvalRequests);
  }
}
```

### 3. Approval UI Example
```javascript
function showApprovalDialog(approvalRequests) {
  approvalRequests.forEach(request => {
    if (request.toolName === 'generate_image_with_approval') {
      const script = request.arguments.script;
      const artStyle = request.arguments.art_style;
      
      // Show approval dialog
      const approved = confirm(
        `Do you approve generating an image with:\n\nScript: ${script}\nArt Style: ${artStyle}`
      );
      
      handleApproval(request.id, approved);
    }
  });
}
```

## Workflow

1. **User Input**: User provides input to start the agent
2. **Agent Processing**: Agent processes the input and determines what content to generate
3. **Approval Required**: If image generation is needed, the agent pauses and requests approval
4. **Frontend Display**: Frontend shows the approval request to the user
5. **User Decision**: User approves or rejects the request
6. **Resume Execution**: Agent continues execution based on user decision
7. **Final Result**: Agent returns the final result

## Configuration

The agent is configured to:
- Use `https://backend.usuals.ai` as the base URL for API calls
- Require JWT authentication for all requests
- Automatically clean up old approval requests after 24 hours
- Handle multiple approval requests in sequence

## Error Handling

The agent handles various error scenarios:
- Network errors when calling external APIs
- Invalid approval requests
- Missing or expired states
- Authentication failures
- Tool execution errors

All errors are logged and returned with appropriate error messages to the frontend.

## Future Extensibility

The architecture is designed to easily support adding new tools later:
- Video generation tools
- Script generation tools
- Audio generation tools
- Custom approval workflows
- Additional external service integrations 