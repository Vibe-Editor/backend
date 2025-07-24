-- AlterEnum
ALTER TYPE "ConversationTypeEnum" ADD VALUE 'CHARACTER_GENERATION';

-- AlterTable
ALTER TABLE "VideoSegmentation" ADD COLUMN     "isSelected" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CharacterGeneration" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "referenceImages" TEXT[],
    "spriteSheetS3Key" TEXT,
    "finalCharacterS3Key" TEXT,
    "visualPrompt" TEXT NOT NULL,
    "artStyle" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "message" TEXT,
    "projectId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterGeneration_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CharacterGeneration" ADD CONSTRAINT "CharacterGeneration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterGeneration" ADD CONSTRAINT "CharacterGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
