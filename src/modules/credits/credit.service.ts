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
    imagen: { regular: 2, edit: 4 },
    recraft: { regular: 1, edit: 2 },
  },
  // Video Generation
  VIDEO_GENERATION: {
    veo2: { regular: 25, edit: 37.5 },
    runwayml: { regular: 2.5, edit: 3.75 },
    kling: { regular: 20, edit: 30 },
    veo3: { regular: 37.5, edit: 0 },
  },
  // Character Generation
  CHARACTER_GENERATION: {
    'recraft-character': { regular: 6, edit: 12 }, // Sprite sheet + final character generation
  },
  // Text Operations
  TEXT_OPERATIONS: {
    perplexity: { regular: 1, edit: 1 },
    'concept-gen': { regular: 1, edit: 1 },
    segmentation: { regular: 3, edit: 6 },
    'content-summarizer': { regular: 1, edit: 1 },
  },
  // Voiceover
  VOICEOVER_GENERATION: {
    elevenlabs: { regular: 2, edit: 2 },
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
   * Deduct credits from user account
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

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Lock the user row for update to prevent race conditions
        const [user] = await tx.$queryRaw<
          Array<{ credits: Decimal }>
        >`SELECT credits FROM "User" WHERE id = ${userId} FOR UPDATE`;

        if (!user) {
          throw new BadRequestException('User not found');
        }

        if (user.credits.lt(requiredCredits)) {
          throw new BadRequestException(
            `Insufficient credits. Required: ${requiredCredits}, Available: ${user.credits}`,
          );
        }

        const newBalance = user.credits.sub(requiredCredits);

        // Create credit transaction
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

        // Update user balance and stats
        await tx.user.update({
          where: { id: userId },
          data: {
            credits: newBalance,
            totalCreditsSpent: { increment: new Decimal(requiredCredits) },
            lastCreditUpdate: new Date(),
          },
        });

        this.logger.log(
          `Deducted ${requiredCredits} credits from user ${userId} for ${operationType}/${modelName}`,
        );

        return transaction.id;
      });
    } catch (error) {
      this.logger.error(`Error deducting credits for user ${userId}:`, error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to deduct credits');
    }
  }

  /**
   * Add credits to user account
   */
  async addCredits(
    userId: string,
    amount: number,
    type: CreditTransactionType = CreditTransactionType.PURCHASE,
    description?: string,
  ): Promise<string> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { credits: true },
        });

        if (!user) {
          throw new BadRequestException('User not found');
        }

        const newBalance = user.credits.add(amount);

        // Create credit transaction
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

        // Update user balance and stats
        await tx.user.update({
          where: { id: userId },
          data: {
            credits: newBalance,
            totalCreditsEarned: { increment: new Decimal(amount) },
            lastCreditUpdate: new Date(),
          },
        });

        this.logger.log(`Added ${amount} credits to user ${userId}`);
        return transaction.id;
      });
    } catch (error) {
      this.logger.error(`Error adding credits for user ${userId}:`, error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to add credits');
    }
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
}
