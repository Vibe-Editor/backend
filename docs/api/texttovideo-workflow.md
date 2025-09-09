# Text-to-Video Workflow API

The Text-to-Video Workflow is a comprehensive AI-powered system that transforms text prompts into complete video productions through multiple stages: web research, concept generation, script segmentation, and video generation.

## Overview

The workflow consists of 4 main steps with **mandatory sequential execution**:
1. **Web Research** - Gather relevant information about the topic
2. **Concept Generation** - Create 4 detailed video concepts using web research data
3. **Script Segmentation** - Generate 2 alternative scripts with 5 segments each using selected concept
4. **Video Generation** - Create videos using selected script's animation prompts with Veo3

### Workflow Data Flow
```
User Prompt → Web Research → 4 Concepts → 2 Scripts (5 segments each) → Videos
     ↓              ↓            ↓              ↓                    ↓
   Step 1        Step 2       Step 3         Step 4              Final Output
```

**Critical Execution Rules:**
- Each step uses output from previous steps as input for data consistency
- Concept generation **MUST** use web_info from step 1 as context
- Segmentation **MUST** use selected concept from step 2 as input  
- Video generation **MUST** use selected script's animation prompts from step 3
- All steps require approval before proceeding to next step

## Authentication

All endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <jwt-token>
```

### Getting a JWT Token

#### For Testing (Development Only)
```bash
curl -X POST http://localhost:8080/auth/test/generate-token \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cmf3jx2yb0000scu3ehuvi48d",
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

#### For Production
Use the standard OAuth flow:
- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google-redirect` - Handle OAuth callback

## Project Setup

Before starting the workflow, you need a valid project ID. Projects organize all generated content.

### Create a Project
```bash
curl -X POST http://localhost:8080/projects \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Video Project",
    "description": "A promotional video project"
  }'
```

**Response:**
```json
{
  "id": "cmf3jxdws0002scu3w9169iv6",
  "name": "My Video Project",
  "description": "A promotional video project",
  "userId": "cmf3jx2yb0000scu3ehuvi48d",
  "createdAt": "2025-01-16T10:30:00Z",
  "updatedAt": "2025-01-16T10:30:00Z"
}
```

### Get Existing Projects
```bash
curl -X GET http://localhost:8080/projects \
  -H "Authorization: Bearer <jwt-token>"
```

## Main Workflow Endpoint

### Start Text-to-Video Workflow

**Endpoint:** `POST /texttovideo/workflow`

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Create a short video about a robot dancing in space",
  "projectId": "cmf3jxdws0002scu3w9169iv6",
  "segmentId": "workflow-001"
}
```

**Parameters:**
- `prompt` (required): Text description of the video you want to create
- `projectId` (required): Valid project ID from `/projects` endpoint
- `segmentId` (optional): Unique identifier for this workflow run

**Example Request:**
```bash
curl -X POST http://localhost:8080/texttovideo/workflow \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a short video about a robot dancing in space",
    "projectId": "cmf3jxdws0002scu3w9169iv6",
    "segmentId": "workflow-001"
  }' \
  --no-buffer
```

## Server-Sent Events (SSE) Response

The workflow streams real-time progress updates via Server-Sent Events. Each event has a `type` and `data` field.

### Event Types

#### 1. `result` - Step Completion
Sent when a workflow step completes successfully.

#### 2. `log` - Progress Updates
Real-time progress information and debugging details.

#### 3. `approval_required` - Manual Approval Needed
The workflow pauses and waits for user approval before proceeding.

#### 4. `error` - Error Occurred
An error happened during processing.

#### 5. `completed` - Workflow Finished
The entire workflow has completed successfully.

### Sample SSE Stream

```
data: {"type":"result","data":{"step":"web_research","message":"Web research completed","webInfo":"Latest trends in robotics and space exploration..."},"timestamp":"2025-01-16T10:30:00Z"}

data: {"type":"approval_required","data":{"approvalId":"approval_1757411199344_txl2mh61a","toolName":"concept_generation_with_approval","step":"concept_generation","message":"Ready to generate 4 video concepts"},"timestamp":"2025-01-16T10:30:05Z"}

data: {"type":"result","data":{"step":"concept_generation","totalConcepts":4,"concepts":[{"id":"concept-1","title":"Cosmic Dance Performance","description":"A sleek robot performs an elegant dance routine against the backdrop of swirling galaxies","tone":"Inspiring and whimsical","goal":"Showcase the beauty of technology and space"}]},"timestamp":"2025-01-16T10:30:15Z"}

data: {"type":"approval_required","data":{"approvalId":"approval_1757411218013_re61ridjf","toolName":"segmentation_with_approval","step":"segmentation","message":"Ready to generate 2 script alternatives with 5 segments each"},"timestamp":"2025-01-16T10:30:20Z"}

data: {"type":"result","data":{"step":"segmentation","totalScripts":2,"scripts":[{"id":"script-1","title":"Main Script","totalSegments":5,"segments":[{"id":"script1-segment-1","narration":"In the vast expanse of space, a lone robot begins its cosmic performance","textPrompt":"A sleek metallic robot floating in space","visualPrompt":"Deep space background with stars and nebulae","animationPrompt":"Robot gracefully extends its arms in a dance-like motion","duration":"5 seconds"}]}]},"timestamp":"2025-01-16T10:30:45Z"}

data: {"type":"approval_required","data":{"approvalId":"approval_1757411299876_vg42nx81k","toolName":"generate_video_with_approval","step":"video_generation","message":"Ready to generate videos using selected script"},"timestamp":"2025-01-16T10:30:50Z"}

data: {"type":"log","data":{"message":"🎬 Using selected script: Main Script","scriptInfo":{"title":"Main Script","summary":"Robot dancing in space with cosmic background","artStyle":"cinematic","totalSegments":5}},"timestamp":"2025-01-16T10:31:00Z"}

data: {"type":"result","data":{"step":"video_generation_segment","segmentId":"script1-segment-1","message":"🎬 Segment script1-segment-1 video completed with Veo3","videoData":{"success":true,"videoUrl":"https://s3.amazonaws.com/videos/segment-001.mp4"},"animationPrompt":"Robot gracefully extends its arms in a dance-like motion..."},"timestamp":"2025-01-16T10:31:30Z"}

data: {"type":"completed","data":{"message":"Text-to-video workflow completed successfully","totalSteps":4,"results":{"webResearch":true,"concepts":4,"scripts":2,"videos":5}},"timestamp":"2025-01-16T10:32:00Z"}
```

## Approval System

The workflow requires manual approval at each major step. When you receive an `approval_required` event, you must send an approval request.

### Approve Workflow Step

**Endpoint:** `POST /texttovideo/approval`

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "approvalId": "approval_1757411199344_txl2mh61a",
  "approved": true
}
```

**Parameters:**
- `approvalId` (required): The approval ID from the `approval_required` event
- `approved` (required): `true` to proceed, `false` to cancel

**Example:**
```bash
curl -X POST http://localhost:8080/texttovideo/approval \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalId": "approval_1757411199344_txl2mh61a",
    "approved": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Approval processed successfully"
}
```

## Workflow Steps Detailed

### Step 1: Web Research
- **Purpose**: Gather relevant information about the video topic
- **API Used**: Perplexity AI for web research
- **Output**: Contextual information to enhance concept generation
- **Credits**: 10 credits deducted

### Step 2: Concept Generation
- **Purpose**: Generate 4 detailed video concepts
- **API Used**: Internal `/concept-writer` endpoint
- **Output**: 4 concepts with titles, descriptions, tones, and goals
- **Credits**: 20 credits deducted
- **Approval**: Required before proceeding

**Sample Concept Output:**
```json
{
  "concepts": [
    {
      "id": "concept-1",
      "title": "Cosmic Dance Performance",
      "description": "A sleek robot performs an elegant dance routine against the backdrop of swirling galaxies and distant stars",
      "tone": "Inspiring and whimsical",
      "goal": "Showcase the beauty of technology harmonizing with the cosmos"
    },
    {
      "id": "concept-2",
      "title": "Zero Gravity Ballet",
      "description": "A humanoid robot demonstrates fluid movements in weightless space environment",
      "tone": "Graceful and mesmerizing",
      "goal": "Highlight the elegance possible in zero gravity"
    }
  ]
}
```

### Step 3: Script Segmentation
- **Purpose**: Generate 2 alternative scripts with 5 segments each
- **API Used**: Internal `/segmentation` endpoint (called twice in parallel)
- **Output**: 2 complete scripts with detailed segment information
- **Credits**: 60 credits deducted (30 per script)
- **Approval**: Required before proceeding

**Sample Script Output:**
```json
{
  "scripts": [
    {
      "id": "script-1",
      "title": "Main Script",
      "totalSegments": 5,
      "summary": "Robot dancing in space with cosmic background",
      "artStyle": "cinematic",
      "segments": [
        {
          "id": "script1-segment-1",
          "narration": "In the vast expanse of space, a lone robot begins its cosmic performance",
          "textPrompt": "A sleek metallic robot floating in space",
          "visualPrompt": "Deep space background with stars and nebulae",
          "animationPrompt": "Robot gracefully extends its arms in a dance-like motion",
          "duration": "5 seconds"
        }
      ]
    },
    {
      "id": "script-2",
      "title": "Alternative Script",
      "totalSegments": 5,
      "summary": "Alternative approach with different camera angles",
      "artStyle": "cinematic",
      "segments": [...]
    }
  ],
  "selectedScript": {
    "id": "script-1",
    "title": "Main Script"
  }
}
```

### Step 4: Video Generation
- **Purpose**: Generate videos for each segment using AI
- **API Used**: Fal.ai Veo3 text-to-video model
- **Input**: Selected script's animation prompts
- **Output**: 5 video files (one per segment)
- **Credits**: Variable based on video length and quality
- **Approval**: Required before proceeding

**Video Generation Process:**
1. Uses the selected script (typically the first one)
2. Extracts animation prompts from each segment
3. Calls Veo3 API for each segment individually
4. Stores generated videos in S3
5. Returns video URLs and metadata

## Credit System

The workflow consumes credits at each step:

| Step | Credits | Description |
|------|---------|-------------|
| Web Research | 10 | Perplexity API call |
| Concept Generation | 20 | Generate 4 concepts |
| Script Segmentation | 60 | Generate 2 scripts (30 each) |
| Video Generation | Variable | Depends on video specs |
| **Total Minimum** | **90+** | Plus video generation costs |

### Check Credit Balance
```bash
curl -X GET http://localhost:8080/credits/balance \
  -H "Authorization: Bearer <jwt-token>"
```

## Error Handling

### Common Error Responses

#### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Invalid or missing JWT token"
}
```

#### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": ["prompt should not be empty", "projectId must be a string"],
  "error": "Bad Request"
}
```

#### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Project not found or access denied",
  "error": "Not Found"
}
```

#### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Failed to generate concepts: API timeout",
  "error": "Internal Server Error"
}
```

### SSE Error Events
```json
{
  "type": "error",
  "data": {
    "message": "Failed to generate segmentation: Invalid concept format",
    "step": "segmentation",
    "error": "API_ERROR"
  },
  "timestamp": "2025-01-16T10:30:00Z"
}
```

## Complete Example Workflow

Here's a complete example of running the text-to-video workflow:

### 1. Get Authentication Token
```bash
# For testing
TOKEN=$(curl -s -X POST http://localhost:8080/auth/test/generate-token \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}' | jq -r '.access_token')
```

### 2. Create or Get Project
```bash
# Create new project
PROJECT_ID=$(curl -s -X POST http://localhost:8080/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Robot Dance Video", "description": "AI-generated robot dancing in space"}' | jq -r '.id')

# Or use existing project
PROJECT_ID="cmf3jxdws0002scu3w9169iv6"
```

### 3. Start Workflow
```bash
curl -X POST http://localhost:8080/texttovideo/workflow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Create a short video about a robot dancing in space\",
    \"projectId\": \"$PROJECT_ID\",
    \"segmentId\": \"workflow-$(date +%s)\"
  }" \
  --no-buffer
```

### 4. Handle Approvals
When you see `approval_required` events, approve them:

```bash
# Approve concept generation
curl -X POST http://localhost:8080/texttovideo/approval \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approvalId": "APPROVAL_ID_FROM_STREAM", "approved": true}'

# Approve segmentation
curl -X POST http://localhost:8080/texttovideo/approval \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approvalId": "APPROVAL_ID_FROM_STREAM", "approved": true}'

# Approve video generation
curl -X POST http://localhost:8080/texttovideo/approval \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approvalId": "APPROVAL_ID_FROM_STREAM", "approved": true}'
```

## Data Storage and Retrieval

All generated content is stored in the database and linked to your project. You can retrieve it using the project endpoints:

### Get All Project Content
```bash
curl -X GET http://localhost:8080/projects/$PROJECT_ID/full \
  -H "Authorization: Bearer $TOKEN"
```

### Get Specific Content Types
```bash
# Get concepts
curl -X GET http://localhost:8080/projects/$PROJECT_ID/concepts \
  -H "Authorization: Bearer $TOKEN"

# Get segmentations
curl -X GET http://localhost:8080/projects/$PROJECT_ID/segmentations \
  -H "Authorization: Bearer $TOKEN"

# Get generated videos
curl -X GET http://localhost:8080/projects/$PROJECT_ID/videos \
  -H "Authorization: Bearer $TOKEN"
```

## Best Practices

### 1. Project Organization
- Create separate projects for different video topics
- Use descriptive project names and descriptions
- Regularly check project content using `/projects/:id/full`

### 2. Credit Management
- Check credit balance before starting workflows
- Monitor credit consumption during long workflows
- Plan for video generation costs (highest credit usage)

### 3. Error Handling
- Always handle SSE connection drops gracefully
- Implement retry logic for approval requests
- Monitor for `error` events in the stream

### 4. Performance
- Use `--no-buffer` flag with curl for real-time streaming
- Implement client-side timeouts for approval steps
- Consider running workflows during off-peak hours

### 5. Content Quality
- Write detailed, specific prompts for better results
- Review generated concepts before approving segmentation
- Test with shorter prompts first to understand the system

## Troubleshooting

### Stream Disconnects
If the SSE stream disconnects during processing:
1. The backend continues processing
2. Check project content using `/projects/:id/full`
3. Look for pending approvals in the logs
4. Restart the workflow if necessary

### Approval Timeouts
Approvals don't expire, but:
1. The system may timeout after extended periods
2. Always approve within a reasonable timeframe
3. Check server logs if approvals seem stuck

### Credit Issues
If you run out of credits:
1. The workflow will stop at the next credit-requiring step
2. Add credits to your account
3. Restart the workflow from the beginning

### Video Generation Failures
If video generation fails:
1. Check the animation prompts in the selected script
2. Verify the Veo3 API is accessible
3. Review segment content for inappropriate material
4. Try with simpler animation prompts

## API Limits and Rate Limiting

- **Concurrent Workflows**: Maximum 3 per user
- **Request Rate**: 100 requests per minute per user
- **Video Generation**: Maximum 10 segments per workflow
- **Project Limit**: 50 projects per user
- **File Storage**: 10GB per user

## Support and Monitoring

### Health Check
```bash
curl -X GET http://localhost:8080/health
```

### System Status
Monitor the workflow status through the SSE stream and project endpoints. All operations are logged for debugging purposes.

For additional support, check the server logs or contact the development team with your project ID and workflow details.
