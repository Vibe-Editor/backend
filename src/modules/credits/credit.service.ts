import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  PrismaClient,
  CreditTransactionType,
  CreditTransactionStatus,
} from '../../../generated/prisma';
import { Decimal } from '@prisma/client/runtime/library';

const PRICING = {
  // Image Generation
  IMAGE_GENERATION: {
    imagen: { regular: 20, edit: 40 },
    recraft: { regular: 10, edit: 20 },
  },
  // Video Generation
  VIDEO_GENERATION: {
    veo2: { regular: 250, edit: 375 },
    runwayml: { regular: 25, edit: 37.5 },
    kling: { regular: 200, edit: 300 },
    veo3: { regular: 750, edit: 750 },
  },
  // Character Generation
  CHARACTER_GENERATION: {
    'recraft-character': { regular: 6, edit: 12 }, // Sprite sheet + final character generation
  },
  // Text Operations
  TEXT_OPERATIONS: {
    perplexity: { regular: 10, edit: 10 },
    'concept-gen': { regular: 10, edit: 1 },
    segmentation: { regular: 30, edit: 60 },
    'content-summarizer': { regular: 1, edit: 1 },
    'summary-generation': { regular: 0.5, edit: 0.5 }, // New model for AI summaries
  },
  // Voiceover
  VOICEOVER_GENERATION: {
    elevenlabs: { regular: 2, edit: 2 },
  },
  // Voice Clip Generation
  VOICE_CLIP_GENERATION: {
    elevenlabs: { regular: 10, edit: 10 },
  },
};

export interface CreditCheck {
  hasEnoughCredits: boolean;
  currentBalance: Decimal;
  requiredCredits: number;
  shortfall?: number;
}

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);
  private readonly prisma = new PrismaClient();

  /**
   * Check if user has enough credits for an operation
   */
  async checkUserCredits(
    userId: string,
    operationType: string,
    modelName: string,
    isEditCall: boolean = false,
  ): Promise<CreditCheck> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const requiredCredits = this.getRequiredCredits(
        operationType,
        modelName,
        isEditCall,
      );
      const currentBalance = user.credits;
      const hasEnoughCredits = currentBalance.gte(requiredCredits);

      return {
        hasEnoughCredits,
        currentBalance,
        requiredCredits,
        shortfall: hasEnoughCredits
          ? undefined
          : requiredCredits - currentBalance.toNumber(),
      };
    } catch (error) {
      this.logger.error(`Error checking credits for user ${userId}:`, error);
      throw new InternalServerErrorException('Failed to check user credits');
    }
  }

  /**
   * Deduct credits using optimistic concurrency control with version field
   */
  async deductCredits(
    userId: string,
    operationType: string,
    modelName: string,
    operationId: string,
    isEditCall: boolean = false,
    description?: string,
  ): Promise<string> {
    const requiredCredits = this.getRequiredCredits(
      operationType,
      modelName,
      isEditCall,
    );

    // Fast fail: Check if user has roughly enough credits (non-blocking read)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.credits.lt(requiredCredits)) {
      throw new BadRequestException(
        `Insufficient credits. Required: ${requiredCredits}, Available: ${user.credits.toNumber()}`,
      );
    }

    // Optimistic concurrency control with exponential backoff + jitter
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Read current user data with version
          const currentUser = await tx.user.findUnique({
            where: { id: userId },
            select: { credits: true, creditVersion: true },
          });

          if (!currentUser) {
            throw new BadRequestException('User not found');
          }

          // Double-check credits within transaction
          if (currentUser.credits.lt(requiredCredits)) {
            throw new BadRequestException(
              `Insufficient credits. Required: ${requiredCredits}, Available: ${currentUser.credits.toNumber()}`,
            );
          }

          const newBalance = currentUser.credits.sub(requiredCredits);

          // Create transaction record first
          const transaction = await tx.creditTransaction.create({
            data: {
              userId,
              amount: new Decimal(-requiredCredits),
              balanceAfter: newBalance,
              type: CreditTransactionType.DEDUCTION,
              status: CreditTransactionStatus.COMPLETED,
              operationType,
              modelUsed: modelName,
              operationId,
              isEditCall,
              description: description || `${operationType} using ${modelName}`,
            },
          });

          // Optimistic update with version check
          const updateResult = await tx.user.updateMany({
            where: {
              id: userId,
              creditVersion: currentUser.creditVersion, // Concurrency token check
            },
            data: {
              credits: newBalance,
              totalCreditsSpent: { increment: new Decimal(requiredCredits) },
              creditVersion: { increment: 1 }, // Atomic version increment
              lastCreditUpdate: new Date(),
            },
          });

          // If no rows updated, version changed (concurrent modification)
          if (updateResult.count === 0) {
            throw new Error('VERSION_CONFLICT');
          }

          this.logger.log(
            `Successfully deducted ${requiredCredits} credits from user ${userId} (version: ${currentUser.creditVersion} → ${currentUser.creditVersion + 1}, attempt: ${attempt})`,
          );

          return transaction.id;
        });
      } catch (error) {
        if (error.message === 'VERSION_CONFLICT' && attempt < maxRetries) {
          // Exponential backoff with jitter
          const baseDelay = Math.pow(2, attempt - 1) * 10; // 10ms, 20ms, 40ms
          const jitter = Math.random() * 10; // 0-10ms random jitter
          const delay = baseDelay + jitter;

          await new Promise((resolve) => setTimeout(resolve, delay));
          this.logger.debug(
            `Version conflict for user ${userId}, retrying in ${delay.toFixed(1)}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          continue;
        }

        this.logger.error(`Error deducting credits for user ${userId}:`, error);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to deduct credits');
      }
    }

    throw new InternalServerErrorException(
      `Failed to deduct credits after ${maxRetries} attempts due to high concurrency`,
    );
  }

  /**
   * Add credits using optimistic concurrency control with version field
   */
  async addCredits(
    userId: string,
    amount: number,
    type: CreditTransactionType = CreditTransactionType.PURCHASE,
    description?: string,
  ): Promise<string> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Read current user data with version
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { credits: true, creditVersion: true },
          });

          if (!user) {
            throw new BadRequestException('User not found');
          }

          const newBalance = user.credits.add(amount);

          // Create transaction record first
          const transaction = await tx.creditTransaction.create({
            data: {
              userId,
              amount: new Decimal(amount),
              balanceAfter: newBalance,
              type,
              status: CreditTransactionStatus.COMPLETED,
              description: description || `Credits added via ${type}`,
            },
          });

          // Optimistic update with version check
          const updateResult = await tx.user.updateMany({
            where: {
              id: userId,
              creditVersion: user.creditVersion, // Concurrency token check
            },
            data: {
              credits: newBalance,
              totalCreditsEarned: { increment: new Decimal(amount) },
              creditVersion: { increment: 1 }, // Atomic version increment
              lastCreditUpdate: new Date(),
            },
          });

          // If no rows updated, version changed (concurrent modification)
          if (updateResult.count === 0) {
            throw new Error('VERSION_CONFLICT');
          }

          this.logger.log(
            `Successfully added ${amount} credits to user ${userId} (version: ${user.creditVersion} → ${user.creditVersion + 1}, attempt: ${attempt})`,
          );

          return transaction.id;
        });
      } catch (error) {
        if (error.message === 'VERSION_CONFLICT' && attempt < maxRetries) {
          // Exponential backoff with jitter
          const baseDelay = Math.pow(2, attempt - 1) * 10; // 10ms, 20ms, 40ms
          const jitter = Math.random() * 10; // 0-10ms random jitter
          const delay = baseDelay + jitter;

          await new Promise((resolve) => setTimeout(resolve, delay));
          this.logger.debug(
            `Version conflict for adding credits to user ${userId}, retrying in ${delay.toFixed(1)}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          continue;
        }

        this.logger.error(`Error adding credits for user ${userId}:`, error);
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new InternalServerErrorException('Failed to add credits');
      }
    }

    throw new InternalServerErrorException(
      `Failed to add credits after ${maxRetries} attempts due to high concurrency`,
    );
  }

  /**
   * Refund credits for a failed operation
   */
  async refundCredits(
    userId: string,
    operationType: string,
    modelName: string,
    operationId: string,
    originalTransactionId: string,
    isEditCall: boolean = false,
    description?: string,
  ): Promise<string> {
    const refundAmount = this.getRequiredCredits(
      operationType,
      modelName,
      isEditCall,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { credits: true },
        });

        if (!user) {
          throw new BadRequestException('User not found');
        }

        const newBalance = user.credits.add(refundAmount);

        // Create refund transaction
        const refundTransaction = await tx.creditTransaction.create({
          data: {
            userId,
            amount: new Decimal(refundAmount),
            balanceAfter: newBalance,
            type: CreditTransactionType.REFUND,
            status: CreditTransactionStatus.COMPLETED,
            operationType,
            modelUsed: modelName,
            operationId,
            isEditCall,
            description:
              description ||
              `Refund for failed ${operationType} using ${modelName}`,
          },
        });

        // Update user balance
        await tx.user.update({
          where: { id: userId },
          data: {
            credits: newBalance,
            totalCreditsSpent: { decrement: new Decimal(refundAmount) },
            lastCreditUpdate: new Date(),
          },
        });

        // Mark original transaction as refunded (optional, for tracking)
        if (originalTransactionId) {
          await tx.creditTransaction.update({
            where: { id: originalTransactionId },
            data: { status: CreditTransactionStatus.REFUNDED },
          });
        }

        this.logger.log(
          `Refunded ${refundAmount} credits to user ${userId} for failed ${operationType}/${modelName}`,
        );

        return refundTransaction.id;
      });
    } catch (error) {
      this.logger.error(`Error refunding credits for user ${userId}:`, error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to refund credits');
    }
  }

  /**
   * Get user's credit balance
   */
  async getUserBalance(userId: string): Promise<Decimal> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      return user.credits;
    } catch (error) {
      this.logger.error(`Error getting balance for user ${userId}:`, error);
      throw new InternalServerErrorException('Failed to get user balance');
    }
  }

  /**
   * Get user's credit transaction history
   */
  async getCreditHistory(userId: string, page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        this.prisma.creditTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.creditTransaction.count({
          where: { userId },
        }),
      ]);

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting credit history for user ${userId}:`,
        error,
      );
      throw new InternalServerErrorException('Failed to get credit history');
    }
  }

  /**
   * Get user's credit stats
   */
  async getUserCreditStats(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          credits: true,
          totalCreditsEarned: true,
          totalCreditsSpent: true,
          lastCreditUpdate: true,
        },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Get usage breakdown by operation type
      const usageBreakdown = await this.prisma.creditTransaction.groupBy({
        by: ['operationType', 'modelUsed'],
        where: {
          userId,
          type: CreditTransactionType.DEDUCTION,
        },
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      });

      return {
        currentBalance: user.credits,
        totalEarned: user.totalCreditsEarned,
        totalSpent: user.totalCreditsSpent,
        lastUpdate: user.lastCreditUpdate,
        usageBreakdown: usageBreakdown.map((item) => ({
          operationType: item.operationType,
          modelUsed: item.modelUsed,
          totalSpent: Math.abs(item._sum.amount?.toNumber() || 0),
          operationCount: item._count.id,
        })),
      };
    } catch (error) {
      this.logger.error(
        `Error getting credit stats for user ${userId}:`,
        error,
      );
      throw new InternalServerErrorException('Failed to get credit stats');
    }
  }

  /**
   * Get required credits for an operation (private helper)
   */
  private getRequiredCredits(
    operationType: string,
    modelName: string,
    isEditCall: boolean,
  ): number {
    const operation = PRICING[operationType];
    if (!operation) {
      throw new BadRequestException(`Unknown operation type: ${operationType}`);
    }

    const model = operation[modelName];
    if (!model) {
      throw new BadRequestException(
        `Unknown model: ${modelName} for operation: ${operationType}`,
      );
    }

    return isEditCall ? model.edit : model.regular;
  }

  /**
   * Get pricing info for debugging/admin purposes
   */
  getPricingInfo() {
    return PRICING;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true },
      });
      return user;
    } catch (error) {
      this.logger.error(`Error finding user by email ${email}:`, error);
      throw new InternalServerErrorException('Failed to find user by email');
    }
  }
}
