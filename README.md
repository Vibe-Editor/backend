## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables (see Environment Setup below)
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod
```

Server will be running at `http://localhost:8080`

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/your_database_name"

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# JWT Secret (use a strong random string in production)
JWT_SECRET="your-jwt-secret-key-change-this-in-production"

# App Settings
PORT=8080
NODE_ENV=development
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API (or Google Identity API)
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Set Application type to "Web application"
6. Add authorized redirect URI: `http://localhost:8080/auth/google-redirect`
7. Copy the Client ID and Client Secret to your `.env` file

## Project Structure

```
src/
├── modules/          # Feature modules
│   ├── auth/        # Google OAuth authentication
│   │   ├── auth.controller.ts    # Auth endpoints
│   │   ├── auth.service.ts       # JWT & auth logic
│   │   ├── auth.module.ts        # Auth module config
│   │   ├── google.strategy.ts    # Google OAuth strategy
│   │   ├── jwt.strategy.ts       # JWT validation strategy
│   │   └── jwt-auth.guard.ts     # JWT protection guard
│   ├── users/       # User management
│   │   ├── dto/     # Data transfer objects
│   │   ├── users.module.ts       # Module definition
│   │   ├── users.controller.ts   # Route handlers
│   │   └── users.service.ts      # Business logic with Prisma
│   ├── projects/    # Project management & organization
│   │   ├── dto/     # Create/update project DTOs
│   │   ├── interfaces/  # TypeScript interfaces
│   │   ├── projects.controller.ts   # CRUD endpoints
│   │   ├── projects.service.ts      # Project business logic
│   │   └── projects.module.ts       # Project module config
│   ├── concept-writer/  # AI video concepts
│   ├── get-web-info/    # Web scraping
│   ├── segmentation/    # Video segmentation
│   ├── image-gen/       # AI image generation
│   ├── video-gen/       # AI video generation
│   └── voiceover/       # Voice generation
│
├── common/          # Shared components
│   ├── decorators/  # Custom decorators (@CurrentUser)
│   ├── guards/      # Route guards
│   ├── interceptors/# Request/Response handlers
│   ├── middleware/  # HTTP middleware
│   └── pipes/      # Data transformation
│
├── config/         # Configuration files
├── interfaces/     # TypeScript interfaces
├── types/         # Type definitions
└── utils/         # Helper functions
```

## Available Scripts

- `npm run start` - Start in development
- `npm run start:dev` - Start with hot reload
- `npm run build` - Build for production
- `npm run start:prod` - Start production server
- `npm run lint` - Check code style
- `npm run format` - Format code

## Adding New Features

### 1. Create a Module

```bash
nest g module modules/your-feature
```

### 2. Add Components

```bash
nest g controller modules/your-feature
nest g service modules/your-feature
```

### 3. Create DTOs

Add in `modules/your-feature/dto/`

- `create-feature.dto.ts`
- `update-feature.dto.ts`

## Common Patterns

### Module Structure

Each feature module should have:

- `module.ts` - Module definition
- `controller.ts` - Route handlers
- `service.ts` - Business logic
- `dto/` - Data transfer objects

### API Endpoints

#### Authentication

- `GET /auth/google` - Initiate Google OAuth login flow
  - Redirects user to Google's authentication page
  - No parameters required

- `GET /auth/google-redirect` - Google OAuth callback endpoint
  - Handles OAuth callback from Google
  - Creates/finds user in database
  - Returns JWT token and user info
  - **Response:**

  ```json
  {
    "success": true,
    "message": "Authentication successful",
    "redirect_url": "myapp://auth-callback?token=...",
    "user": {
      "id": number,
      "email": string,
      "name": string,
      "avatar": string
    },
    "access_token": "jwt-token-here"
  }
  ```

- `GET /auth/status` - Check authentication status (🔒 Protected)
  - Requires: `Authorization: Bearer <jwt-token>` header
  - Returns current user information
  - **Response:**
  ```json
  {
    "success": true,
    "user": { "id": 1, "email": "user@example.com", "name": "User" },
    "message": "User is authenticated"
  }
  ```

#### Users

- `GET /users` - List all users
- `GET /users/:id` - Get user by ID
- `GET /users/email/:email` - Get user by email address

#### Projects (🔒 Protected)

- `POST /projects` - Create new project
  - **Requires**: JWT Authentication
  - **Body**: `{name: string, description?: string}`
  - **Example Request**:

  ```json
  {
    "name": "My Video Project",
    "description": "A promotional video for our product"
  }
  ```

  - **Returns**:

  ```json
  {
    "id": "clxyz123abc",
    "name": "My Video Project",
    "description": "A promotional video for our product",
    "userId": "cluser123",
    "createdAt": "2025-01-16T10:30:00Z",
    "updatedAt": "2025-01-16T10:30:00Z"
  }
  ```

- `GET /projects` - Get all user projects with statistics
  - **Requires**: JWT Authentication
  - **Returns**: Array of projects with content counts

  ```json
  [
    {
      "id": "clxyz123abc",
      "name": "My Video Project",
      "description": "A promotional video",
      "userId": "cluser123",
      "createdAt": "2025-01-16T10:30:00Z",
      "updatedAt": "2025-01-16T10:30:00Z",
      "_count": {
        "conversations": 5,
        "videoConcepts": 2,
        "generatedImages": 8,
        "generatedVideos": 3,
        "generatedVoiceovers": 1
      }
    }
  ]
  ```

- `GET /projects/:id` - Get specific project with statistics
  - **Requires**: JWT Authentication
  - **Returns**: Single project with content counts

- `PATCH /projects/:id` - Update project
  - **Requires**: JWT Authentication
  - **Body**: `{name?: string, description?: string}`
  - **Example Request**:

  ```json
  {
    "name": "Updated Project Name",
    "description": "Updated description for the project"
  }
  ```

  - **Returns**: Updated project data

- `DELETE /projects/:id` - Delete project and all related content
  - **Requires**: JWT Authentication
  - **Note**: Cascade deletes all conversations, concepts, images, videos, etc.
  - **Returns**: Success confirmation

#### AI Services

**Note**: All AI services now support optional project assignment and conversation tracking. Include `projectId` in requests to associate content with a specific project.

- `GET /health` - check if the server is running.

- `POST /concept-writer` - Generate creative video concepts
  - takes in `{prompt: string, web_info: string}` as parameter
  - **Example Request**:

  ```json
  {
    "prompt": "Create a promotional video for a new eco-friendly water bottle",
    "web_info": "Latest trends in sustainable products and environmental awareness campaigns"
  }
  ```

  - returns

  ```
  {
     "concepts": [
       {
         "title": string,
         "concept": string,
         "tone": string,
         "goal": string
       }
     ]
  }
  ```

- `POST /get-web-info` - Get information from the web using Perplexity AI
  - takes in `{prompt: string}` as parameter
  - **Example Request**:

  ```json
  {
    "prompt": "What are the latest trends in sustainable packaging for 2025?"
  }
  ```

  - returns response from Perplexity AI's chat completion API

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

- `POST /segmentation` - Generate and segment video scripts using AI model handoff (OpenAI GPT-4o or Gemini 2.5 Pro)
  - takes in `{prompt: string, concept:string, negative_prompt: string}` as parameters
  - **Example Request**:

  ```json
  {
    "prompt": "Create a 30-second promotional video showcasing our eco-friendly water bottle",
    "concept": "Focus on sustainability, health benefits, and modern lifestyle",
    "negative_prompt": "Avoid plastic waste imagery, don't show competing brands"
  }
  ```

  - returns

  ```
  {
   "segments": [
       {
           "id": string,
           "visual": string,
           "narration": string,
           "animation": string
       }
   ],
   "artStyle": string,
   "model": string
  }
  ```

- `POST /image-gen` - Generate images using AI model handoff (Recraft AI or Google Imagen)
  - **Features**: Intelligent model selection based on content type (realistic vs artistic/text-based)
  - **Models**: Recraft AI for realistic images, Google Imagen for artistic/text content
  - takes in `{visual_prompt: string, art_style: string, uuid: string}` as parameters
  - **Example Request**:

  ```json
  {
    "visual_prompt": "A sleek eco-friendly water bottle on a wooden desk with green plants in the background",
    "art_style": "modern minimalist photography",
    "uuid": "segment-001-image"
  }
  ```

  - returns

  ```
  {
       "success": boolean,
       "s3_key": string,
       "model": string,
       "message": string,
       "image_size_bytes": number
  }
  ```

- `POST /video-gen` - Generate videos using AI model handoff (Google Veo2 or RunwayML Gen-3)
  - **Features**: Intelligent model selection based on content style (cartoonish vs realistic)
  - **Models**: Google Veo2 for animated/cartoon content, RunwayML Gen-3 Alpha Turbo for realistic content
  - takes in `{animation_prompt: string, art_style: string, imageS3Key: string, uuid: string}` as parameters
  - **Example Request**:

  ```json
  {
    "animation_prompt": "Camera slowly zooms in on the water bottle while a hand reaches for it, smooth professional movement",
    "art_style": "cinematic realistic",
    "imageS3Key": "images/segment-001-image.jpg",
    "uuid": "segment-001-video"
  }
  ```

  - returns

  ```
  {
       "success": boolean,
       "s3Keys": string[],
       "model": string,
       "totalVideos": number
  }
  ```

- `POST /voiceover` - Generate voiceovers
  - takes in `{narration_prompt: string}` as parameters.
  - **Example Request**:
  ```json
  {
    "narration_prompt": "Introducing the future of hydration - our new eco-friendly water bottle that's as good for you as it is for the planet."
  }
  ```

  - returns
  ```
  {
     s3_key: string;
  }
  ```

## Authentication Flow

This backend implements Google OAuth for desktop application authentication:

### Flow for Desktop Apps

1. **Initiate Login**: Desktop app opens browser/webview to `GET /auth/google`
2. **Google OAuth**: User completes Google authentication
3. **Callback Processing**: Backend receives OAuth callback at `/auth/google-redirect`
   - Creates or finds user in PostgreSQL database
   - Generates JWT token (expires in 7 days)
   - Returns JSON response with token and redirect URL
4. **Token Retrieval**: Desktop app captures the JWT token from the response
5. **API Authentication**: Desktop app includes token in requests:
   ```bash
   Authorization: Bearer <jwt-token>
   ```

### Example Desktop Integration

```javascript
// Desktop app opens auth URL
const authUrl = 'http://localhost:8080/auth/google';
window.open(authUrl);

// Handle auth response (implementation varies by framework)
// Extract token from response and store securely
const token = response.access_token;

// Use token for API calls
fetch('http://localhost:8080/auth/status', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### Protecting Routes

To protect your own routes, use the `@UseGuards(AuthGuard('jwt'))` decorator:

```typescript
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('protected')
export class ProtectedController {
  @Get('data')
  @UseGuards(AuthGuard('jwt'))
  async getProtectedData(@CurrentUser() user: User) {
    // user is automatically injected from JWT token
    return { data: 'secret', userId: user.id };
  }
}
```

## Project Organization System

### Content Hierarchy

```
User
├── Project A
│   ├── Conversations (chat history)
│   ├── Video Concepts
│   ├── Web Research Queries
│   ├── Content Summaries
│   ├── Video Segmentations
│   ├── Generated Images
│   ├── Generated Videos
│   └── Generated Voiceovers
└── Project B
    └── (same structure)
```

### Benefits

1. **Organization**: Users can group related content into projects
2. **Isolation**: Each project maintains its own conversation history and assets
3. **Analytics**: Track progress and usage per project
4. **Collaboration**: Future-ready for team features
5. **Cleanup**: Easy bulk deletion of project content

### Conversation Tracking

The system automatically tracks all user interactions and AI responses in the `ConversationHistory` table:

#### Conversation Types

- `CONCEPT_GENERATION` - Video concept creation interactions
- `WEB_RESEARCH` - Web information gathering
- `CONTENT_SUMMARY` - Content summarization requests
- `VIDEO_SEGMENTATION` - Video script segmentation
- `IMAGE_GENERATION` - Image creation requests
- `VIDEO_GENERATION` - Video generation requests
- `VOICEOVER_GENERATION` - Voice synthesis requests
- `GENERAL_CHAT` - General user interactions

#### Implementation in Services

To add conversation tracking to existing services:

```typescript
// Example: Save conversation history after AI response
await this.prisma.conversationHistory.create({
  data: {
    type: 'CONCEPT_GENERATION',
    userInput: JSON.stringify(conceptWriterDto),
    response: JSON.stringify(result),
    metadata: {
      model: 'gemini-2.5-pro',
      tokens: responseTokens,
      processingTime: duration,
    },
    projectId: conceptWriterDto.projectId, // Optional
    userId: userId,
  },
});
```

### Project Integration Guide

#### For Frontend Developers

1. **Project Selection**: Implement project picker in UI
2. **Context Passing**: Include `projectId` in API requests when available
3. **Organization**: Group content by projects in UI
4. **Analytics**: Display project statistics from `_count` fields

#### For Backend Developers

1. **Service Updates**: Add optional `projectId` parameter to existing services
2. **Conversation Logging**: Implement conversation tracking in service methods
3. **Authorization**: Ensure users can only access their own projects
4. **Migration**: Update existing content to support project assignment

## Best Practices

1. **Modularity**
   - Keep modules focused and independent
   - Use feature-based organization

2. **Code Organization**
   - Follow the established folder structure
   - Keep related files together

3. **Naming Conventions**
   - Use descriptive, consistent names
   - Follow NestJS naming patterns

4. **Security**
   - Always use HTTPS in production
   - Store JWT secret securely
   - Implement proper token refresh logic
   - Validate user permissions for sensitive operations
