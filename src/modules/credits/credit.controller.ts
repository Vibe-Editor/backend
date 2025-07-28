import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditTransactionType } from '../../../generated/prisma';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AddCreditsDto {
  userId: string;
  amount: number;
  type?: CreditTransactionType;
  description?: string;
}

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  /**
   * Get user's credit balance
   */
  @Get('balance/:userId')
  async getUserBalance(@Param('userId') userId: string) {
    const balance = await this.creditService.getUserBalance(userId);
    return {
      credits: balance.toNumber(),
      message: 'Credit balance retrieved successfully',
    };
  }

  /**
   * Get user's complete credit stats
   */
  @Get('stats/:userId')
  async getUserStats(@Param('userId') userId: string) {
    const stats = await this.creditService.getUserCreditStats(userId);
    return {
      ...stats,
      currentBalance: stats.currentBalance.toNumber(),
      totalEarned: stats.totalEarned.toNumber(),
      totalSpent: stats.totalSpent.toNumber(),
      message: 'Credit stats retrieved successfully',
    };
  }

  /**
   * Get user's credit transaction history
   */
  @Get('history/:userId')
  async getCreditHistory(
    @Param('userId') userId: string,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
  ) {
    const result = await this.creditService.getCreditHistory(
      userId,
      page,
      limit,
    );

    // Convert Decimal amounts to numbers for JSON response
    const transactions = result.transactions.map((transaction) => ({
      ...transaction,
      amount: transaction.amount.toNumber(),
      balanceAfter: transaction.balanceAfter.toNumber(),
    }));

    return {
      transactions,
      pagination: result.pagination,
      message: 'Credit history retrieved successfully',
    };
  }

  /**
   * Check if user has enough credits for an operation
   */
  @Get('check/:userId/:operationType/:modelName')
  async checkCredits(
    @Param('userId') userId: string,
    @Param('operationType') operationType: string,
    @Param('modelName') modelName: string,
    @Query('isEditCall') isEditCall: string = 'false',
  ) {
    const isEdit = isEditCall === 'true';
    const result = await this.creditService.checkUserCredits(
      userId,
      operationType,
      modelName,
      isEdit,
    );

    return {
      ...result,
      currentBalance: result.currentBalance.toNumber(),
      message: result.hasEnoughCredits
        ? 'User has sufficient credits'
        : 'Insufficient credits',
    };
  }

  /**
   * Add credits to user account (admin only)
   */
  @Post('add')
  async addCredits(@Body() addCreditsDto: AddCreditsDto) {
    const transactionId = await this.creditService.addCredits(
      addCreditsDto.userId,
      addCreditsDto.amount,
      addCreditsDto.type || CreditTransactionType.GRANT,
      addCreditsDto.description,
    );

    const newBalance = await this.creditService.getUserBalance(
      addCreditsDto.userId,
    );

    return {
      transactionId,
      newBalance: newBalance.toNumber(),
      message: `Successfully added ${addCreditsDto.amount} credits`,
    };
  }

  /**
   * Get current pricing information
   */
  @Get('pricing')
  async getPricing() {
    const pricing = this.creditService.getPricingInfo();
    return {
      pricing,
      message: 'Pricing information retrieved successfully',
    };
  }

  /**
   * Deduct credits for an operation (used by AI services)
   */
  @Post('deduct')
  async deductCredits(
    @Body()
    deductDto: {
      userId: string;
      operationType: string;
      modelName: string;
      operationId: string;
      isEditCall?: boolean;
      description?: string;
    },
  ) {
    const transactionId = await this.creditService.deductCredits(
      deductDto.userId,
      deductDto.operationType,
      deductDto.modelName,
      deductDto.operationId,
      deductDto.isEditCall || false,
      deductDto.description,
    );

    const newBalance = await this.creditService.getUserBalance(
      deductDto.userId,
    );

    return {
      transactionId,
      newBalance: newBalance.toNumber(),
      message: 'Credits deducted successfully',
    };
  }
}
