import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  PrismaClient,
  CreditTransactionType,
  CreditTransactionStatus,
  CreditTransaction,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface CreateTransactionData {
  userId: string;
  amount: Decimal;
  type: CreditTransactionType;
  status: CreditTransactionStatus;
  operationType?: string;
  modelUsed?: string;
  operationId?: string;
  isEditCall?: boolean;
  description?: string;
  metadata?: any;
}

export interface TransactionFilter {
  userId?: string;
  operationType?: string;
  modelUsed?: string;
  type?: CreditTransactionType;
  status?: CreditTransactionStatus;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class CreditTransactionService {
  private readonly logger = new Logger(CreditTransactionService.name);
  private readonly prisma = new PrismaClient();

  async createTransaction(
    data: CreateTransactionData,
    prismaTransaction?: any,
  ): Promise<CreditTransaction> {
    this.logger.log(
      `Creating credit transaction: ${data.type} ${data.amount} for user ${data.userId}`,
    );

    const prisma = prismaTransaction || this.prisma;

    try {
      const transaction = await prisma.creditTransaction.create({
        data: {
          userId: data.userId,
          amount: data.amount,
          balanceAfter: new Decimal(0), // Will be updated after user balance is modified
          type: data.type,
          status: data.status,
          operationType: data.operationType,
          modelUsed: data.modelUsed,
          operationId: data.operationId,
          isEditCall: data.isEditCall ?? false,
          metadata: data.metadata || {},
          description: data.description,
          processedAt:
            data.status === CreditTransactionStatus.COMPLETED
              ? new Date()
              : null,
        },
      });

      this.logger.log(`Created credit transaction: ${transaction.id}`);
      return transaction;
    } catch (error) {
      this.logger.error('Error creating credit transaction:', error);
      throw new InternalServerErrorException(
        'Failed to create credit transaction',
      );
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(id: string): Promise<CreditTransaction | null> {
    return this.prisma.creditTransaction.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  /**
   * Get user's transaction history with pagination
   */
  async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 50,
    filter?: Omit<TransactionFilter, 'userId'>,
  ): Promise<{
    transactions: CreditTransaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.logger.log(`Getting transaction history for user ${userId}`);

    const skip = (page - 1) * limit;
    const where: any = { userId };

    // Apply filters
    if (filter) {
      if (filter.operationType) where.operationType = filter.operationType;
      if (filter.modelUsed) where.modelUsed = filter.modelUsed;
      if (filter.type) where.type = filter.type;
      if (filter.status) where.status = filter.status;
      if (filter.startDate || filter.endDate) {
        where.createdAt = {};
        if (filter.startDate) where.createdAt.gte = filter.startDate;
        if (filter.endDate) where.createdAt.lte = filter.endDate;
      }
    }

    try {
      const [transactions, total] = await Promise.all([
        this.prisma.creditTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.creditTransaction.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        transactions,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      this.logger.error('Error getting user transactions:', error);
      throw new InternalServerErrorException(
        'Failed to get transaction history',
      );
    }
  }

  /**
   * Get transactions by operation ID (useful for tracking related transactions)
   */
  async getTransactionsByOperation(
    operationId: string,
  ): Promise<CreditTransaction[]> {
    return this.prisma.creditTransaction.findMany({
      where: { operationId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  /**
   * Get pending transactions for a user
   */
  async getPendingTransactions(userId: string): Promise<CreditTransaction[]> {
    return this.prisma.creditTransaction.findMany({
      where: {
        userId,
        status: CreditTransactionStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    id: string,
    status: CreditTransactionStatus,
    metadata?: any,
  ): Promise<CreditTransaction> {
    this.logger.log(`Updating transaction ${id} status to ${status}`);

    try {
      return await this.prisma.creditTransaction.update({
        where: { id },
        data: {
          status,
          processedAt:
            status === CreditTransactionStatus.COMPLETED ? new Date() : null,
          metadata: metadata ? { ...metadata } : undefined,
        },
      });
    } catch (error) {
      this.logger.error('Error updating transaction status:', error);
      throw new InternalServerErrorException(
        'Failed to update transaction status',
      );
    }
  }

  /**
   * Get credit usage analytics for a user
   */
  async getUserCreditAnalytics(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalSpent: Decimal;
    totalRefunded: Decimal;
    totalGranted: Decimal;
    operationBreakdown: {
      operationType: string;
      totalSpent: Decimal;
      count: number;
    }[];
    modelBreakdown: { modelUsed: string; totalSpent: Decimal; count: number }[];
  }> {
    this.logger.log(`Getting credit analytics for user ${userId}`);

    const where: any = { userId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    try {
      // Get all transactions for analysis
      const transactions = await this.prisma.creditTransaction.findMany({
        where,
        select: {
          amount: true,
          type: true,
          status: true,
          operationType: true,
          modelUsed: true,
        },
      });

      // Calculate totals
      let totalSpent = new Decimal(0);
      let totalRefunded = new Decimal(0);
      let totalGranted = new Decimal(0);

      const operationBreakdown = new Map<
        string,
        { totalSpent: Decimal; count: number }
      >();
      const modelBreakdown = new Map<
        string,
        { totalSpent: Decimal; count: number }
      >();

      for (const transaction of transactions) {
        if (transaction.status !== CreditTransactionStatus.COMPLETED) continue;

        const amount = transaction.amount;

        switch (transaction.type) {
          case CreditTransactionType.DEDUCTION:
            totalSpent = totalSpent.add(amount.abs());
            break;
          case CreditTransactionType.REFUND:
            totalRefunded = totalRefunded.add(amount);
            break;
          case CreditTransactionType.PURCHASE:
            totalGranted = totalGranted.add(amount);
            break;
        }

        // Operation breakdown (only for deductions)
        if (
          transaction.type === CreditTransactionType.DEDUCTION &&
          transaction.operationType
        ) {
          const key = transaction.operationType;
          const current = operationBreakdown.get(key) || {
            totalSpent: new Decimal(0),
            count: 0,
          };
          operationBreakdown.set(key, {
            totalSpent: current.totalSpent.add(amount.abs()),
            count: current.count + 1,
          });
        }

        // Model breakdown (only for deductions)
        if (
          transaction.type === CreditTransactionType.DEDUCTION &&
          transaction.modelUsed
        ) {
          const key = transaction.modelUsed;
          const current = modelBreakdown.get(key) || {
            totalSpent: new Decimal(0),
            count: 0,
          };
          modelBreakdown.set(key, {
            totalSpent: current.totalSpent.add(amount.abs()),
            count: current.count + 1,
          });
        }
      }

      return {
        totalSpent,
        totalRefunded,
        totalGranted,
        operationBreakdown: Array.from(operationBreakdown.entries()).map(
          ([operationType, data]) => ({
            operationType,
            ...data,
          }),
        ),
        modelBreakdown: Array.from(modelBreakdown.entries()).map(
          ([modelUsed, data]) => ({
            modelUsed,
            ...data,
          }),
        ),
      };
    } catch (error) {
      this.logger.error('Error getting credit analytics:', error);
      throw new InternalServerErrorException('Failed to get credit analytics');
    }
  }

  /**
   * Clean up old completed transactions (for maintenance)
   */
  async cleanupOldTransactions(olderThanDays: number = 90): Promise<number> {
    this.logger.log(
      `Cleaning up transactions older than ${olderThanDays} days`,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    try {
      const result = await this.prisma.creditTransaction.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          status: {
            in: [
              CreditTransactionStatus.COMPLETED,
              CreditTransactionStatus.REFUNDED,
            ],
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} old transactions`);
      return result.count;
    } catch (error) {
      this.logger.error('Error cleaning up old transactions:', error);
      throw new InternalServerErrorException(
        'Failed to cleanup old transactions',
      );
    }
  }
}
