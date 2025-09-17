import { Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Transaction wrapper utility for consistent database transaction handling
 */
export class TransactionWrapper {
  private static readonly logger = new Logger(TransactionWrapper.name);

  /**
   * Execute a function within a database transaction
   * Automatically handles commit/rollback and logging
   */
  static async execute<T>(
    prisma: PrismaClient,
    operation: (tx: any) => Promise<T>,
    operationName?: string,
  ): Promise<T> {
    const opName = operationName || 'Transaction';
    const startTime = Date.now();

    this.logger.log(`Starting ${opName}`);

    try {
      const result = await prisma.$transaction(async (tx) => {
        this.logger.debug(`Executing ${opName} within transaction`);
        return await operation(tx);
      });

      const duration = Date.now() - startTime;
      this.logger.log(`${opName} completed successfully in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`${opName} failed after ${duration}ms:`, error);

      // Re-throw with more context
      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `${opName} failed: ${error.message}`,
        );
      } else {
        throw new InternalServerErrorException(
          `${opName} failed due to unknown error`,
        );
      }
    }
  }

  /**
   * Execute a credit-aware operation with proper transaction handling
   * This wraps the common pattern of: reserve credits -> perform operation -> confirm/refund credits
   */
  static async executeWithCredits<T>(
    prisma: PrismaClient,
    creditReservationFn: (tx: any) => Promise<{ transactionId: string }>,
    operation: (tx: any, reservation: { transactionId: string }) => Promise<T>,
    confirmCreditsFn: (
      tx: any,
      transactionId: string,
      result: T,
    ) => Promise<void>,
    refundCreditsFn: (
      tx: any,
      transactionId: string,
      error: Error,
    ) => Promise<void>,
    operationName?: string,
  ): Promise<T> {
    const opName = operationName || 'Credit Operation';
    const startTime = Date.now();

    this.logger.log(`Starting credit-aware ${opName}`);

    try {
      return await prisma.$transaction(async (tx) => {
        let reservation: { transactionId: string } | null = null;

        try {
          // Step 1: Reserve credits
          this.logger.debug(`${opName}: Reserving credits`);
          reservation = await creditReservationFn(tx);

          // Step 2: Perform the main operation
          this.logger.debug(`${opName}: Executing main operation`);
          const result = await operation(tx, reservation);

          // Step 3: Confirm credits on success
          this.logger.debug(`${opName}: Confirming credits`);
          await confirmCreditsFn(tx, reservation.transactionId, result);

          const duration = Date.now() - startTime;
          this.logger.log(
            `Credit-aware ${opName} completed successfully in ${duration}ms`,
          );

          return result;
        } catch (operationError) {
          // Step 4: Refund credits on failure
          if (reservation) {
            this.logger.debug(
              `${opName}: Refunding credits due to operation failure`,
            );
            try {
              await refundCreditsFn(
                tx,
                reservation.transactionId,
                operationError as Error,
              );
            } catch (refundError) {
              this.logger.error(
                `${opName}: Failed to refund credits:`,
                refundError,
              );
              // Don't throw refund error, let the original error propagate
            }
          }

          throw operationError;
        }
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Credit-aware ${opName} failed after ${duration}ms:`,
        error,
      );

      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `${opName} failed: ${error.message}`,
        );
      } else {
        throw new InternalServerErrorException(
          `${opName} failed due to unknown error`,
        );
      }
    }
  }

  /**
   * Execute multiple operations in a single transaction
   * Useful for batch operations or complex multi-step processes
   */
  static async executeBatch<T>(
    prisma: PrismaClient,
    operations: Array<(tx: any) => Promise<any>>,
    operationName?: string,
  ): Promise<T[]> {
    const opName = operationName || 'Batch Transaction';
    const startTime = Date.now();

    this.logger.log(`Starting ${opName} with ${operations.length} operations`);

    try {
      const results = await prisma.$transaction(async (tx) => {
        const batchResults: any[] = [];

        for (let i = 0; i < operations.length; i++) {
          this.logger.debug(
            `${opName}: Executing operation ${i + 1}/${operations.length}`,
          );
          const result = await operations[i](tx);
          batchResults.push(result);
        }

        return batchResults;
      });

      const duration = Date.now() - startTime;
      this.logger.log(`${opName} completed successfully in ${duration}ms`);

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`${opName} failed after ${duration}ms:`, error);

      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `${opName} failed: ${error.message}`,
        );
      } else {
        throw new InternalServerErrorException(
          `${opName} failed due to unknown error`,
        );
      }
    }
  }

  /**
   * Execute with retry logic for handling transaction conflicts
   */
  static async executeWithRetry<T>(
    prisma: PrismaClient,
    operation: (tx: any) => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 100,
    operationName?: string,
  ): Promise<T> {
    const opName = operationName || 'Retry Transaction';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`${opName}: Attempt ${attempt}/${maxRetries}`);
        return await this.execute(
          prisma,
          operation,
          `${opName} (attempt ${attempt})`,
        );
      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.error(`${opName}: All ${maxRetries} attempts failed`);
          throw error;
        }

        // Check if this is a retryable error (transaction conflicts, deadlocks, etc.)
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable) {
          this.logger.error(`${opName}: Non-retryable error encountered`);
          throw error;
        }

        this.logger.warn(
          `${opName}: Attempt ${attempt} failed, retrying in ${retryDelay}ms`,
        );
        await this.sleep(retryDelay);
        retryDelay *= 2; // Exponential backoff
      }
    }

    throw new InternalServerErrorException(
      `${opName}: Unexpected end of retry loop`,
    );
  }

  /**
   * Check if an error is retryable (transaction conflicts, connection issues, etc.)
   */
  private static isRetryableError(error: any): boolean {
    if (!error || typeof error !== 'object') return false;

    const errorMessage = error.message || '';
    const errorCode = error.code || '';

    // Common retryable error patterns
    const retryablePatterns = [
      'transaction',
      'deadlock',
      'lock',
      'conflict',
      'connection',
      'timeout',
      'serialization',
    ];

    return retryablePatterns.some(
      (pattern) =>
        errorMessage.toLowerCase().includes(pattern) ||
        errorCode.toLowerCase().includes(pattern),
    );
  }

  /**
   * Sleep utility for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
