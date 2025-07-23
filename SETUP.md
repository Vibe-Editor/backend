# Setup

## Quick Start

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

## Environment Variables

```env
GEMINI_API_KEY=
OPENAI_API_KEY=

FAL_KEY=
ELEVENLABS_API_KEY=

PERPLEXITY_API_KEY=

RECRAFT_API_KEY=

RUNWAYML_API_KEY=

KLING_AI_ACCESS_KEY=
KLING_AI_SECRET_KEY=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=

DATABASE_URL=postgresql://postgres:sh@localhost:5432/postgres

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

JWT_SECRET=
```

## Google OAuth Setup

1. Go to Google Cloud Console
2. Create OAuth 2.0 Client ID
3. Add redirect URI: `http://localhost:8080/auth/google-redirect`
4. Copy credentials to .env

## Project Structure

```
src/
├── modules/          # Feature modules
│   ├── auth/        # Google OAuth + JWT
│   ├── projects/    # Project management
│   ├── concept-writer/  # AI concept generation
│   ├── segmentation/    # Video segmentation
│   ├── image-gen/       # AI image generation
│   ├── video-gen/       # AI video generation
│   ├── voiceover/       # Voice generation
│   ├── get-web-info/    # Web scraping
│   └── user-input-summarizer/  # Content summarization
├── common/          # Shared guards, decorators, pipes
└── main.ts         # App entry point
```

## Adding New Features

```bash
nest g module modules/feature-name
nest g controller modules/feature-name
nest g service modules/feature-name
```
