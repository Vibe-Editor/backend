# Agent System Architecture Guide

## Overview

The agent system uses the **OpenAI Agents SDK** to create intelligent workflows that can execute multiple tools with user approval. Currently it handles:

1. **Web Research** → 2. **Concept Generation** → **[STOPS HERE]**

But you want the complete pipeline:
1. **Web Research** → 2. **Concept Generation** → 3. **Script Generation** → 4. **Image Generation** → 5. **Video Generation**

## Current Architecture

### Core Components

```
src/modules/agent/
├── agent.service.ts      # Main agent logic and tool definitions
├── agent.controller.ts   # API endpoints
├── agent.module.ts      # Module configuration
└── dto/agent.dto.ts     # Data transfer objects
```

### Key Classes

1. **AgentService** - Creates and manages OpenAI agents
2. **AgentController** - Handles HTTP requests and streaming
3. **ApprovalRequest** - Manages tool execution approvals

## OpenAI Agents SDK Usage

### Basic Agent Creation

```typescript
import { Agent, tool, run } from '@openai/agents';

// Create a tool
const myTool = tool({
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  },
  needsApproval: true, // Requires user approval before execution
  execute: async (params) => {
    // Tool logic here
    return { result: 'success' };
  }
});

// Create an agent with tools
const agent = new Agent({
  name: 'My Agent',
  instructions: 'Agent behavior instructions...',
  tools: [myTool]
});

// Run the agent
const result = await run(agent, userInput);
```

### Tool Types in Current System

#### 1. No Approval Tools
```typescript
// Example: get_web_info, generate_segmentation
execute: async (params) => {
  const response = await axios.post(`${baseUrl}/endpoint`, params, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  return response.data;
}
```

#### 2. Approval Required Tools
```typescript
// Example: generate_image_with_approval, generate_concepts_with_approval
{
  needsApproval: true,
  execute: async (params) => {
    // This will trigger approval flow
    return await generateContent(params);
  }
}
```

## Approval System Flow

### 1. User Makes Request
```http
POST /agent/run
{
  "prompt": "Create a face wash advertisement",
  "segmentId": "seg123",
  "projectId": "proj456"
}
```

### 2. Agent Processes Request
- Agent runs through tools sequentially
- When it hits a tool with `needsApproval: true`, it pauses

### 3. Approval Request Generated
```typescript
// System creates ApprovalRequest
interface ApprovalRequest {
  id: string;                    // approval_1234567890_abc123
  agentName: string;            // "Content Generation Agent"
  toolName: string;             // "generate_image_with_approval" 
  arguments: any;               // Tool parameters
  status: 'pending' | 'approved' | 'rejected';
  timestamp: Date;
  authToken?: string;           // For API calls
}
```

### 4. Frontend Gets Approval Request via Stream
```typescript
// Streaming response
{
  type: 'approval_required',
  data: {
    approvalId: 'approval_1234567890_abc123',
    toolName: 'generate_image_with_approval',
    arguments: {
      script: 'Beautiful space scene with stars',
      art_style: 'realistic',
      segmentId: 'seg123',
      projectId: 'proj456'
    },
    agentName: 'Content Generation Agent'
  },
  timestamp: '2024-01-01T12:00:00.000Z'
}
```

### 5. User Approves/Rejects
```http
POST /agent/approval
{
  "approvalId": "approval_1234567890_abc123",
  "approved": true
}
```

### 6. Agent Continues Execution
- Tool executes with approved parameters
- Agent continues to next step

## Existing API Endpoints

### Start Agent Run (Streaming)
```http
POST /agent/run
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "prompt": "Create content about AI",
  "segmentId": "optional-segment-id", 
  "projectId": "optional-project-id"
}
```

**Response:** Server-Sent Events stream with:
```typescript
interface StreamMessage {
  type: 'log' | 'approval_required' | 'result' | 'error' | 'completed';
  data: any;
  timestamp: Date;
}
```

### Handle Approval
```http
POST /agent/approval
Authorization: Bearer <jwt_token>

{
  "approvalId": "approval_1234567890_abc123",
  "approved": true
}
```

### Get Pending Approvals
```http
GET /agent/approvals/pending
Authorization: Bearer <jwt_token>
```

## How to Add New Tools

### Step 1: Define Parameters Interface
```typescript
interface NewToolParams {
  param1: string;
  param2: string;
  projectId: string;
  userId: string;
}
```

### Step 2: Create Tool Method
```typescript
private createNewTool(authToken?: string) {
  return tool({
    name: 'new_tool',
    description: 'What this tool does',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'Parameter 1' },
        param2: { type: 'string', description: 'Parameter 2' },
        projectId: { type: 'string', description: 'Project ID' },
        userId: { type: 'string', description: 'User ID' }
      },
      required: ['param1', 'param2', 'projectId', 'userId'],
      additionalProperties: false
    },
    needsApproval: true, // Set to true if needs approval
    execute: async (params: NewToolParams) => {
      try {
        const response = await axios.post(`${this.baseUrl}/endpoint`, params, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        return response.data;
      } catch (error) {
        this.logger.error(`❌ [NEW_TOOL] Error: ${error.message}`);
        throw new Error(`Failed to execute new tool: ${error.message}`);
      }
    }
  });
}
```

### Step 3: Add to Agent Tools Array
```typescript
private createAgent(authToken?: string) {
  return new Agent({
    name: 'Content Generation Agent',
    instructions: `...your instructions...`,
    tools: [
      this.createGetWebInfoTool(authToken),
      this.createConceptWriterTool(authToken),
      this.createNewTool(authToken), // Add your new tool here
      // ... other tools
    ]
  });
}
```

### Step 4: Handle Approval Execution (if needsApproval: true)
```typescript
private async executeApprovedTool(approvalRequest: ApprovalRequest, streamSubject: Subject<StreamMessage>): Promise<any> {
  try {
    const { toolName, arguments: args, authToken } = approvalRequest;
    
    if (toolName === 'new_tool') {
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      const { param1, param2, projectId, userId } = parsedArgs;
      
      streamSubject.next({
        type: 'log',
        data: { message: 'Executing new tool...' },
        timestamp: new Date()
      });

      const response = await axios.post(`${this.baseUrl}/endpoint`, {
        param1,
        param2,
        projectId,
        userId
      }, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: response.data,
        message: 'New tool executed successfully'
      };
    }
    
    // ... handle other tools
  } catch (error) {
    this.logger.error(`❌ [TOOL] Error: ${error.message}`);
    throw error;
  }
}
```

## Adding the Missing Pipeline Tools

### 1. Script Generation Tool (using Segmentation)
```typescript
private createScriptGenerationTool(authToken?: string) {
  return tool({
    name: 'generate_script',
    description: 'Generate script segments for video production',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Script generation prompt' },
        concept: { type: 'string', description: 'Selected concept from previous step' },
        negative_prompt: { type: 'string', description: 'Negative prompt (optional)' },
        projectId: { type: 'string', description: 'Project ID' },
        userId: { type: 'string', description: 'User ID' }
      },
      required: ['prompt', 'concept', 'projectId', 'userId'],
      additionalProperties: true
    },
    execute: async (params) => {
      const response = await axios.post(`${this.baseUrl}/segmentation`, params, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    }
  });
}
```

### 2. Video Generation Tool 
```typescript
private createVideoGenerationTool(authToken?: string) {
  return tool({
    name: 'generate_video_with_approval',
    description: 'Generate video from image using AI models',
    parameters: {
      type: 'object',
      properties: {
        animation_prompt: { type: 'string', description: 'Animation prompt' },
        art_style: { type: 'string', description: 'Art style' },
        imageS3Key: { type: 'string', description: 'S3 key of the image to animate' },
        segmentId: { type: 'string', description: 'Segment ID' },
        projectId: { type: 'string', description: 'Project ID' },
        userId: { type: 'string', description: 'User ID' }
      },
      required: ['animation_prompt', 'art_style', 'imageS3Key', 'segmentId', 'projectId', 'userId'],
      additionalProperties: false
    },
    needsApproval: true,
    execute: async (params) => {
      const response = await axios.post(`${this.baseUrl}/video-gen`, params, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    }
  });
}
```

## Updated Agent Instructions for Full Pipeline

```typescript
instructions: `You are an AI agent that creates complete content using this MANDATORY workflow:

COMPLETE PIPELINE FOR ALL REQUESTS:
1. FIRST: Use get_web_info tool to research the user's request
2. SECOND: Use generate_concepts_with_approval tool (requires approval)
3. THIRD: After concept approval, use generate_script tool with selected concept
4. FOURTH: Use generate_image_with_approval tool (requires approval) for each script segment
5. FIFTH: Use generate_video_with_approval tool (requires approval) for each generated image

DIRECT COMMANDS SUPPORT:
- If user says "make the image" or "generate image": Skip to step 4
- If user says "make the video" or "generate video": Skip to step 5 (requires existing image)
- If user says "write the script": Skip to step 3
- Always ask for missing context if needed

APPROVAL FLOW:
- Present clear information about what will be generated
- Wait for user approval before executing expensive operations
- Continue pipeline after each approval

EXAMPLE FULL WORKFLOW:
User: "Create a face wash advertisement"
1. Research face wash market trends
2. Generate 4 concepts → get approval → select concept
3. Generate script segments from selected concept
4. Generate images for each segment → get approval → create images
5. Generate videos from images → get approval → create videos

EXAMPLE DIRECT COMMAND:
User: "make the image" 
→ Ask for script/concept if missing
→ Use generate_image_with_approval with provided/default parameters`
```

## Frontend Integration Examples

### 1. Handle Different Stream Message Types
```typescript
const eventSource = new EventSource('/agent/run');

eventSource.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'log':
      console.log('Agent:', message.data.message);
      break;
      
    case 'approval_required':
      showApprovalDialog(message.data);
      break;
      
    case 'result':
      displayResult(message.data);
      break;
      
    case 'completed':
      showFinalResult(message.data.finalOutput);
      eventSource.close();
      break;
      
    case 'error':
      showError(message.data.message);
      break;
  }
};
```

### 2. Smart Approval UI
```typescript
function showApprovalDialog(approvalData) {
  const { approvalId, toolName, arguments: args } = approvalData;
  
  switch (toolName) {
    case 'generate_concepts_with_approval':
      showConceptApproval(approvalId, args);
      break;
      
    case 'generate_image_with_approval':
      showImageApproval(approvalId, args);
      break;
      
    case 'generate_video_with_approval':
      showVideoApproval(approvalId, args);
      break;
  }
}

function showImageApproval(approvalId, args) {
  const modal = document.createElement('div');
  modal.innerHTML = `
    <div class="approval-modal">
      <h3>Image Generation Approval</h3>
      <p><strong>Script:</strong> ${args.script}</p>
      <p><strong>Art Style:</strong> ${args.art_style}</p>
      <p><strong>Cost:</strong> 1 credit</p>
      <button onclick="approveRequest('${approvalId}', true)">Approve</button>
      <button onclick="approveRequest('${approvalId}', false)">Reject</button>
    </div>
  `;
  document.body.appendChild(modal);
}

async function approveRequest(approvalId, approved) {
  await fetch('/agent/approval', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ approvalId, approved })
  });
  
  // Remove modal
  document.querySelector('.approval-modal').remove();
}
```

## Testing the System

### 1. Test Current Flow
```bash
curl -X POST http://localhost:8080/agent/run \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a face wash advertisement",
    "projectId": "test-project",
    "segmentId": "test-segment"
  }'
```

### 2. Test Direct Commands
```bash
# Direct image generation
curl -X POST http://localhost:8080/agent/run \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "make the image with script: beautiful sunset over mountains, art style: realistic"
  }'
```

### 3. Test Approval Flow
```bash
# Get pending approvals
curl -X GET http://localhost:8080/agent/approvals/pending \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Approve a request
curl -X POST http://localhost:8080/agent/approval \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalId": "approval_1234567890_abc123",
    "approved": true
  }'
```

## Next Steps

1. **Add Script Generation Tool** - Connect to segmentation module
2. **Add Video Generation Tool** - Connect to video-gen module  
3. **Update Agent Instructions** - Support direct commands and full pipeline
4. **Test Complete Flow** - Verify all tools work together
5. **Improve Frontend** - Better approval UI and result display

## Key Files to Modify

1. `src/modules/agent/agent.service.ts` - Add new tools and update instructions
2. `src/modules/agent/agent.controller.ts` - Update if needed for new endpoints
3. Frontend components - Improve approval UI and result handling

This system is powerful because it:
- ✅ Uses industry-standard OpenAI Agents SDK
- ✅ Has built-in approval system for user control
- ✅ Supports streaming for real-time feedback
- ✅ Is modular and extensible
- ✅ Handles authentication and error cases
- ✅ Can support both full workflows and direct commands
