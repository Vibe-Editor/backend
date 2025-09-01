# Backend API
dev 
## Authentication

Google OAuth flow:

1. Desktop app opens `GET /auth/google`
2. User completes Google auth
3. Backend returns JWT token (7 days expiry)
4. Include in requests: `Authorization: Bearer <jwt-token>`

## Route Protection

```typescript
@UseGuards(JwtAuthGuard)
async protectedRoute(@CurrentUser() user: User) {
  // user auto-injected from JWT
}
```

## Project Structure

All content is organized under projects:

- Each user has multiple projects
- Each project contains: concepts, segmentations, images, videos, voiceovers, web research
- Conversation history is tracked per project

### Key Endpoints

- `GET /projects/:id/full` - Get project with all content
- `PATCH /segmentation/:id/select` - Mark segmentation as selected

## Conversation Tracking

All AI interactions are logged in `ConversationHistory` with types:

- `CONCEPT_GENERATION`, `VIDEO_SEGMENTATION`, `IMAGE_GENERATION`, etc.

```typescript
// Log conversation
await this.prisma.conversationHistory.create({
  data: {
    type: 'CONCEPT_GENERATION',
    userInput: JSON.stringify(dto),
    response: JSON.stringify(result),
    projectId: dto.projectId,
    userId: userId,
  },
});
```
