# Agent Run: Web Research → Concept Generation (With Approvals)

This document describes the Agent run flow that strictly covers:
- get_web_info (web research)
- generate_concepts_with_approval (concept generation with human-in-the-loop)

Excluded from this document: image generation, chat tool, and segmentation.

## Overview

For every user prompt, the agent follows a mandatory 2-step workflow and pauses for approval:
1. Web Research: Uses `get_web_info` to collect relevant information.
2. Concept Generation (Requires Approval): Uses `generate_concepts_with_approval` to produce four concepts based on the web info. The agent pauses and emits an approval request to the client.

All routes below require JWT authentication.

## Authentication
- Header: `Authorization: Bearer <JWT>`

## Endpoints

### POST /agent/run (SSE stream)
Starts an agent run and streams progress/events using Server-Sent Events.

Headers:
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

Body:
```json
{
  "prompt": "string",
  "segmentId": "string (optional)",
  "projectId": "string (optional)"
}
```

Behavior:
- Emits `log` messages while the agent processes the request.
- Executes `get_web_info` first.
- Executes `generate_concepts_with_approval` next; this triggers an approval interruption.
- Emits `approval_required` with an `approvalId` and tool arguments for concept generation.
- After you POST an approval decision to `/agent/approval`, emits either a `result` (on approval) or an informational `log` (on rejection), then finally `completed`.

SSE message types:
- `log`: Progress updates
- `approval_required`: A decision is required from a human
- `result`: Result of the approved concept generation
- `completed`: Run finished successfully
- `error`: Run encountered an error

Example SSE messages:
```json
{"type":"log","data":{"message":"Starting agent run..."},"timestamp":"2025-08-07T07:24:36.356Z"}
{"type":"approval_required","data":{"approvalId":"approval_...","toolName":"generate_concepts_with_approval","arguments":"{...}","agentName":"Content Generation Agent"},"timestamp":"..."}
{"type":"result","data":{"success":true,"data":{"concepts":[...]},"message":"Concepts generated successfully"},"timestamp":"..."}
{"type":"completed","data":{"message":"Agent run completed successfully"},"timestamp":"..."}
```

### POST /agent/approval
Approve or reject a pending approval request.

Headers:
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

Body:
```json
{
  "approvalId": "string",
  "approved": true
}
```

Response:
```json
{
  "status": "success",
  "message": "Request approved successfully"
}
```

### GET /agent/approvals/pending
List all pending approvals.

### GET /agent/approvals/:approvalId
Fetch a single approval request by ID.

### POST /agent/cleanup
Remove old approval requests (maintenance utility).

## Internal Tooling (for understanding the flow)

These tools are invoked internally by the agent and authenticated using the provided JWT. Clients do not call these tools directly—interact only with the `agent/*` endpoints above.

- get_web_info
  - Purpose: Perform web research for the user’s prompt.
  - Params: `prompt`, `projectId`, `userId` (the `userId` is injected from the authenticated context; clients should not pass it directly to the tool).
  - Backend call: `POST /get-web-info` (internal, with auth).
  - Approval: Not required.

- generate_concepts_with_approval
  - Purpose: Generate 4 concepts using the prompt and the web research results.
  - Params: `prompt`, `web_info`, `projectId`, `userId` (the `userId` is injected from the authenticated context).
  - Triggers: An approval interruption. The agent pauses and emits `approval_required` with an `approvalId` and the tool arguments.
  - On approval: The service continues and calls backend `POST /concept-writer` (internal, with auth) and emits a `result` message with the generated concepts.

## Typical Streaming Sequence
- log: Starting agent run...
- log: Agent is processing your request...
- approval_required: Approve running `generate_concepts_with_approval` with given arguments
- (Client calls POST /agent/approval with the provided `approvalId`)
- log: Approval received, continuing execution...
- log: Generating concepts...
- result: Concepts generated successfully
- completed: Agent run completed successfully

## Examples

Start a run (SSE):
```bash
curl -N -X POST https://backend.usuals.ai/agent/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An advertisement for a face wash",
    "projectId": "proj_123",
    "segmentId": "seg_456"
  }'
```

Approve a pending request:
```bash
curl -X POST https://backend.usuals.ai/agent/approval \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalId": "approval_1754551476356_pvww456cf",
    "approved": true
  }'
```

List pending approvals:
```bash
curl -X GET https://backend.usuals.ai/agent/approvals/pending \
  -H "Authorization: Bearer <token>"
```

Fetch a specific approval:
```bash
curl -X GET https://backend.usuals.ai/agent/approvals/approval_1754551476356_pvww456cf \
  -H "Authorization: Bearer <token>"
```

## Notes & Constraints
- The agent always starts with `get_web_info`, then proceeds to `generate_concepts_with_approval` and pauses for human approval.
- Do not include or invoke other tools (image generation, chat, segmentation) in this flow unless explicitly extended.
- SSE events include timestamps; clients should be prepared to handle out-of-order arrival under network jitter.
- `segmentId` and `projectId` are optional in the run request; `userId` is provided by the authenticated context automatically. 