# Database Documentation

## Overview

This document provides comprehensive documentation for the Vibe backend database schema. The database uses PostgreSQL as the primary database with Prisma as the ORM.

## Database Configuration

- **Provider**: PostgreSQL
- **ORM**: Prisma Client
- **Client Output**: `../generated/prisma`

## Models

### User

The central user model that manages authentication, profile information, and credit system.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique user identifier
- `email` (String, @unique) - User's email address
- `name` (String?) - User's display name
- `avatar` (String?) - URL to user's avatar image
- `googleId` (String, @unique) - Google OAuth identifier
- `createdAt` (DateTime, @default(now())) - Account creation timestamp

**Credit System Fields:**

- `credits` (Decimal, @default(0), @db.Decimal(10, 2)) - Current credit balance
- `creditVersion` (Int, @default(0)) - Optimistic concurrency control version
- `totalCreditsEarned` (Decimal, @default(0), @db.Decimal(12, 2)) - Lifetime credits earned
- `totalCreditsSpent` (Decimal, @default(0), @db.Decimal(12, 2)) - Lifetime credits spent
- `lastCreditUpdate` (DateTime, @default(now())) - Last credit operation timestamp

**Relationships:**

- One-to-Many with `Project`
- One-to-Many with `ConversationHistory`
- One-to-Many with `VideoConcept`
- One-to-Many with `WebResearchQuery`
- One-to-Many with `ContentSummary`
- One-to-Many with `VideoSegmentation`
- One-to-Many with `GeneratedImage`
- One-to-Many with `GeneratedVideo`
- One-to-Many with `GeneratedVoiceover`
- One-to-Many with `CharacterGeneration`
- One-to-Many with `CreditTransaction`

### Project

Represents user projects that organize various AI-generated content.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique project identifier
- `name` (String) - Project name
- `description` (String?) - Project description
- `userId` (String) - Reference to the project owner
- `createdAt` (DateTime, @default(now())) - Project creation timestamp
- `updatedAt` (DateTime, @updatedAt) - Last update timestamp

**Relationships:**

- Many-to-One with `User`
- One-to-Many with `ConversationHistory`
- One-to-Many with `VideoConcept`
- One-to-Many with `WebResearchQuery`
- One-to-Many with `ContentSummary`
- One-to-Many with `VideoSegmentation`
- One-to-Many with `GeneratedImage`
- One-to-Many with `GeneratedVideo`
- One-to-Many with `GeneratedVoiceover`
- One-to-Many with `CharacterGeneration`

### CreditTransaction

Tracks all credit-related transactions for audit and billing purposes.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique transaction identifier
- `userId` (String) - Reference to the user
- `amount` (Decimal, @db.Decimal(10, 2)) - Credit amount (positive for credits, negative for debits)
- `balanceAfter` (Decimal, @db.Decimal(10, 2)) - User balance after this transaction
- `type` (CreditTransactionType) - Transaction type (DEDUCTION, REFUND, PURCHASE)
- `status` (CreditTransactionStatus, @default(PENDING)) - Transaction status
- `operationType` (String?) - Operation type (e.g., "IMAGE_GENERATION", "VIDEO_GENERATION")
- `modelUsed` (String?) - AI model used (e.g., "imagen", "recraft", "veo2")
- `operationId` (String?) - Reference to the specific operation
- `isEditCall` (Boolean, @default(false)) - Whether this used edit call pricing
- `metadata` (Json?) - Additional operation details
- `description` (String?) - Human-readable description
- `createdAt` (DateTime, @default(now())) - Transaction creation timestamp
- `processedAt` (DateTime?) - When the transaction was completed

**Relationships:**

- Many-to-One with `User`

**Indexes:**

- `[userId, createdAt]` - For efficient user transaction queries
- `[operationType, modelUsed]` - For analytics and reporting

### ConversationHistory

Stores chat conversations and AI interactions across different features.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique conversation identifier
- `type` (ConversationTypeEnum) - Type of conversation
- `userInput` (String) - User's input message
- `response` (String) - AI response
- `metadata` (Json?) - Additional conversation metadata
- `projectId` (String) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Conversation timestamp

**Relationships:**

- Many-to-One with `Project`
- Many-to-One with `User`

### VideoConcept

Stores AI-generated video concepts and ideas.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique concept identifier
- `prompt` (String) - User's concept generation prompt
- `webInfo` (String) - Web research information used
- `title` (String) - Generated concept title
- `concept` (String) - Generated concept description
- `tone` (String) - Concept tone/style
- `goal` (String) - Concept goal/purpose
- `projectId` (String?) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Creation timestamp

**Credit Fields:**

- `creditsUsed` (Decimal?, @db.Decimal(8, 2)) - Credits consumed
- `creditTransactionId` (String?) - Reference to credit transaction
- `isRefunded` (Boolean, @default(false)) - Refund status

**Relationships:**

- Many-to-One with `Project` (optional)
- Many-to-One with `User`

### WebResearchQuery

Stores web research queries and results.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique query identifier
- `prompt` (String) - Research query
- `response` (String) - Research results
- `projectId` (String?) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Query timestamp

**Credit Fields:**

- `creditsUsed` (Decimal?, @db.Decimal(8, 2)) - Credits consumed
- `creditTransactionId` (String?) - Reference to credit transaction
- `isRefunded` (Boolean, @default(false)) - Refund status

**Relationships:**

- Many-to-One with `Project` (optional)
- Many-to-One with `User`

### ContentSummary

Stores content summarization results.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique summary identifier
- `originalContent` (String) - Original content to summarize
- `userInput` (String) - User's summarization request
- `summary` (String) - Generated summary
- `projectId` (String?) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Creation timestamp

**Credit Fields:**

- `creditsUsed` (Decimal?, @db.Decimal(8, 2)) - Credits consumed
- `creditTransactionId` (String?) - Reference to credit transaction
- `isRefunded` (Boolean, @default(false)) - Refund status

**Relationships:**

- Many-to-One with `Project` (optional)
- Many-to-One with `User`

### VideoSegmentation

Stores video segmentation prompts and configurations.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique segmentation identifier
- `prompt` (String) - Segmentation prompt
- `concept` (String) - Video concept
- `negativePrompt` (String?) - Negative prompt for generation
- `artStyle` (String) - Art style specification
- `model` (String) - AI model used
- `isSelected` (Boolean, @default(false)) - Whether this segmentation is selected
- `projectId` (String?) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Creation timestamp

**Credit Fields:**

- `creditsUsed` (Decimal?, @db.Decimal(8, 2)) - Credits consumed
- `creditTransactionId` (String?) - Reference to credit transaction
- `isRefunded` (Boolean, @default(false)) - Refund status

**Relationships:**

- Many-to-One with `Project` (optional)
- Many-to-One with `User`
- One-to-Many with `VideoSegment`

### VideoSegment

Stores individual video segments within a segmentation.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique segment identifier
- `segmentId` (String) - Segment identifier
- `visual` (String) - Visual description
- `narration` (String) - Narration text
- `animation` (String) - Animation description
- `videoSegmentationId` (String) - Reference to parent segmentation
- `createdAt` (DateTime, @default(now())) - Creation timestamp

**Relationships:**

- Many-to-One with `VideoSegmentation`

### GeneratedImage

Stores AI-generated images and their metadata.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique image identifier
- `visualPrompt` (String) - Image generation prompt
- `artStyle` (String) - Art style used
- `uuid` (String) - Unique generation identifier
- `success` (Boolean) - Generation success status
- `s3Key` (String?) - S3 storage key
- `model` (String?) - AI model used
- `message` (String?) - Error or success message
- `imageSizeBytes` (Int?) - Image file size
- `projectId` (String?) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Creation timestamp

**Credit Fields:**

- `creditsUsed` (Decimal?, @db.Decimal(8, 2)) - Credits consumed
- `creditTransactionId` (String?) - Reference to credit transaction
- `isRefunded` (Boolean, @default(false)) - Refund status

**Relationships:**

- Many-to-One with `Project` (optional)
- Many-to-One with `User`

### GeneratedVideo

Stores AI-generated videos and their metadata.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique video identifier
- `animationPrompt` (String) - Video generation prompt
- `artStyle` (String) - Art style used
- `imageS3Key` (String) - Reference image S3 key
- `uuid` (String) - Unique generation identifier
- `success` (Boolean) - Generation success status
- `model` (String?) - AI model used
- `totalVideos` (Int?) - Number of videos generated
- `projectId` (String?) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Creation timestamp

**Credit Fields:**

- `creditsUsed` (Decimal?, @db.Decimal(8, 2)) - Credits consumed
- `creditTransactionId` (String?) - Reference to credit transaction
- `isRefunded` (Boolean, @default(false)) - Refund status

**Relationships:**

- Many-to-One with `Project` (optional)
- Many-to-One with `User`
- One-to-Many with `GeneratedVideoFile`

### GeneratedVideoFile

Stores individual video files within a video generation.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique file identifier
- `s3Key` (String) - S3 storage key
- `generatedVideoId` (String) - Reference to parent video generation
- `createdAt` (DateTime, @default(now())) - Creation timestamp

**Relationships:**

- Many-to-One with `GeneratedVideo`

### GeneratedVoiceover

Stores AI-generated voiceovers and their metadata.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique voiceover identifier
- `narrationPrompt` (String) - Voiceover generation prompt
- `s3Key` (String) - S3 storage key
- `projectId` (String?) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Creation timestamp

**Credit Fields:**

- `creditsUsed` (Decimal?, @db.Decimal(8, 2)) - Credits consumed
- `creditTransactionId` (String?) - Reference to credit transaction
- `isRefunded` (Boolean, @default(false)) - Refund status

**Relationships:**

- Many-to-One with `Project` (optional)
- Many-to-One with `User`

### CharacterGeneration

Stores AI-generated character assets and metadata.

**Fields:**

- `id` (String, @id, @default(cuid())) - Unique character identifier
- `name` (String?) - Character name
- `description` (String?) - Character description
- `referenceImages` (String[]) - Array of 6 image S3 keys
- `spriteSheetS3Key` (String?) - Sprite sheet S3 key
- `finalCharacterS3Key` (String?) - Final character S3 key
- `visualPrompt` (String) - Character generation prompt
- `artStyle` (String) - Art style used
- `uuid` (String) - Unique generation identifier
- `success` (Boolean, @default(false)) - Generation success status
- `model` (String?) - AI model used
- `message` (String?) - Error or success message
- `projectId` (String?) - Reference to the project
- `userId` (String) - Reference to the user
- `createdAt` (DateTime, @default(now())) - Creation timestamp
- `updatedAt` (DateTime, @updatedAt) - Last update timestamp

**Credit Fields:**

- `creditsUsed` (Decimal?, @db.Decimal(8, 2)) - Credits consumed
- `creditTransactionId` (String?) - Reference to credit transaction
- `isRefunded` (Boolean, @default(false)) - Refund status

**Relationships:**

- Many-to-One with `Project` (optional)
- Many-to-One with `User`

## Enums

### CreditTransactionType

Defines the types of credit transactions:

- `DEDUCTION` - Credits deducted for service usage
- `REFUND` - Credits refunded to user
- `PURCHASE` - Credits purchased by user

### CreditTransactionStatus

Defines the status of credit transactions:

- `PENDING` - Transaction is pending processing
- `COMPLETED` - Transaction completed successfully
- `FAILED` - Transaction failed
- `CANCELLED` - Transaction was cancelled
- `REFUNDED` - Transaction was refunded

### ConversationTypeEnum

Defines the types of conversations:

- `CONCEPT_GENERATION` - Video concept generation
- `WEB_RESEARCH` - Web research queries
- `CONTENT_SUMMARY` - Content summarization
- `VIDEO_SEGMENTATION` - Video segmentation
- `IMAGE_GENERATION` - Image generation
- `VIDEO_GENERATION` - Video generation
- `VOICEOVER_GENERATION` - Voiceover generation
- `CHARACTER_GENERATION` - Character generation
- `GENERAL_CHAT` - General chat conversations

## Database Relationships

### One-to-Many Relationships

1. **User → Projects**: A user can have multiple projects
2. **User → ConversationHistory**: A user can have multiple conversations
3. **User → VideoConcept**: A user can generate multiple video concepts
4. **User → WebResearchQuery**: A user can make multiple web research queries
5. **User → ContentSummary**: A user can create multiple content summaries
6. **User → VideoSegmentation**: A user can create multiple video segmentations
7. **User → GeneratedImage**: A user can generate multiple images
8. **User → GeneratedVideo**: A user can generate multiple videos
9. **User → GeneratedVoiceover**: A user can generate multiple voiceovers
10. **User → CharacterGeneration**: A user can generate multiple characters
11. **User → CreditTransaction**: A user can have multiple credit transactions
12. **Project → ConversationHistory**: A project can have multiple conversations
13. **Project → VideoConcept**: A project can have multiple video concepts
14. **Project → WebResearchQuery**: A project can have multiple web research queries
15. **Project → ContentSummary**: A project can have multiple content summaries
16. **Project → VideoSegmentation**: A project can have multiple video segmentations
17. **Project → GeneratedImage**: A project can have multiple generated images
18. **Project → GeneratedVideo**: A project can have multiple generated videos
19. **Project → GeneratedVoiceover**: A project can have multiple generated voiceovers
20. **Project → CharacterGeneration**: A project can have multiple character generations
21. **VideoSegmentation → VideoSegment**: A segmentation can have multiple segments
22. **GeneratedVideo → GeneratedVideoFile**: A video generation can have multiple video files

### Many-to-One Relationships

All the reverse relationships of the above, where child entities reference their parent entities.

## Credit System

The database implements a comprehensive credit system with the following features:

### User Credit Management

- **Current Balance**: `credits` field tracks current available credits
- **Lifetime Tracking**: `totalCreditsEarned` and `totalCreditsSpent` track lifetime usage
- **Optimistic Concurrency**: `creditVersion` prevents race conditions
- **Audit Trail**: `lastCreditUpdate` tracks when credits were last modified

### Transaction Tracking

- **Detailed Records**: Every credit operation creates a `CreditTransaction` record
- **Operation Metadata**: Tracks operation type, model used, and specific operation ID
- **Status Management**: Supports pending, completed, failed, cancelled, and refunded states
- **Refund Support**: `isRefunded` flag on content models and transaction status

### Content Credit Integration

All AI-generated content models include credit tracking fields:

- `creditsUsed`: Amount of credits consumed
- `creditTransactionId`: Reference to the specific transaction
- `isRefunded`: Whether credits were refunded for this operation

## Data Types

### Decimal Precision

- **User Credits**: 10 digits total, 2 decimal places (e.g., 12345678.90)
- **Lifetime Credits**: 12 digits total, 2 decimal places (e.g., 1234567890.12)
- **Content Credits**: 8 digits total, 2 decimal places (e.g., 123456.78)

### String Identifiers

- **CUID**: All primary keys use CUID for distributed ID generation
- **UUID**: Generation operations use UUID for tracking

### JSON Fields

- **Metadata**: Flexible JSON storage for additional operation details
- **Reference Images**: Array of strings for multiple image references

## Indexes

The database includes strategic indexes for performance:

1. **Credit Transactions**: `[userId, createdAt]` for efficient user transaction history
2. **Credit Analytics**: `[operationType, modelUsed]` for usage analytics and reporting

## Cascade Deletes

The schema implements cascade deletes for data integrity:

- **User Deletion**: All user-related data is automatically deleted
- **Project Deletion**: All project-related data is automatically deleted
- **VideoSegmentation Deletion**: All related video segments are deleted
- **GeneratedVideo Deletion**: All related video files are deleted

## Best Practices

1. **Credit Operations**: Always use transactions for credit operations to maintain consistency
2. **File References**: Store S3 keys rather than full URLs for flexibility
3. **Metadata**: Use JSON fields for extensible metadata storage
4. **Audit Trail**: Credit transactions provide complete audit trail
5. **Refund Handling**: Use `isRefunded` flags for content-level refund tracking
