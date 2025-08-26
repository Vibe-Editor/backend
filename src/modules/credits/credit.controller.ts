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
import Stripe from 'stripe';

interface AddCreditsDto {
  userId: string;
  amount: number;
  type?: CreditTransactionType;
  description?: string;
}

interface CreateCheckoutSessionDto {
  planType: string;
  email?: string;
  userId: string;
  credits: number;
  amount: number; // in dollars
  clientType?: 'web' | 'electron'; // Added to distinguish client type
  baseUrl?: string; // Allow client to specify its own base URL
}

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditController {
  private stripe: Stripe;

  constructor(private readonly creditService: CreditService) {
    // Use environment variable or fallback dummy key to prevent crashes
    const stripeKey =
      process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_initialization';

    console.log(
      '🔧 Initializing Stripe with key:',
      stripeKey.substring(0, 20) + '...',
    );

    if (!process.env.STRIPE_SECRET_KEY) {
      console.log(
        '⚠️ STRIPE_SECRET_KEY environment variable is not set, using dummy key',
      );
    } else {
      console.log('✅ Using STRIPE_SECRET_KEY from environment');
    }

    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-07-30.basil',
    });

    console.log('✅ Stripe initialized successfully');
  }

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
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
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
      addCreditsDto.type || CreditTransactionType.PURCHASE,
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
  getPricing() {
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

  /**
   * Create Stripe checkout session
   */
  @Post('create_checkout_session')
  async createCheckoutSession(
    @Body() createSessionDto: CreateCheckoutSessionDto,
  ) {
    console.log('🛒 Creating checkout session for:', createSessionDto);

    // Check if we have a real Stripe key
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error(
        'Stripe is not configured. Please add your Stripe SECRET KEY (starts with sk_test_ or sk_live_) to environment variables as STRIPE_SECRET_KEY.',
      );
    }

    try {
      // Determine the appropriate redirect URLs based on client type
      let successUrl: string;
      let cancelUrl: string;

      if (createSessionDto.clientType === 'electron') {
        // For Electron, use custom protocol URLs that will never try to load real pages
        successUrl =
          'usuals://payment-success?session_id={CHECKOUT_SESSION_ID}';
        cancelUrl = 'usuals://payment-cancel?canceled=true';
        console.log('🖥️ Using Electron custom protocol URLs');
      } else {
        // For web, redirect back to the main page with payment result params
        const baseUrl = createSessionDto.baseUrl || 'http://localhost:3000';
        successUrl = `${baseUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`;
        cancelUrl = `${baseUrl}?payment=canceled&canceled=true`;
        console.log('🌐 Using web redirect URLs with base:', baseUrl);
      }

      console.log('🔗 Redirect URLs:', { successUrl, cancelUrl });

      console.log('💳 Creating Stripe session with params:', {
        credits: createSessionDto.credits,
        amount: createSessionDto.amount,
        planType: createSessionDto.planType,
        userId: createSessionDto.userId,
        email: createSessionDto.email,
        clientType: createSessionDto.clientType,
      });

      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${createSessionDto.credits.toLocaleString()} AI Credits`,
                description: `${createSessionDto.planType} Plan - AI Video Generation Credits`,
              },
              unit_amount: createSessionDto.amount * 100, // Convert to cents
            },
            quantity: 1,
          },
        ],
        customer_email: createSessionDto.email,
        metadata: {
          userId: createSessionDto.userId,
          planType: createSessionDto.planType,
          credits: createSessionDto.credits.toString(),
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      console.log('✅ Stripe session created successfully:', {
        sessionId: session.id,
        url: session.url,
        amount: session.amount_total,
      });

      return {
        url: session.url,
        sessionId: session.id,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      console.error('❌ Failed to create checkout session:', error);

      throw new Error(`Failed to create checkout session: ${errorMessage}`);
    }
  }

  /**
   * Verify Stripe session
   */
  @Get('verify-session')
  async verifySession(@Query('session_id') sessionId: string) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      const verified = session.payment_status === 'paid';

      // If verified and not already processed, add credits
      if (verified && session.metadata) {
        const userId = session.metadata.userId;
        const credits = parseInt(session.metadata.credits || '0');
        const planType = session.metadata.planType;

        if (userId && credits > 0) {
          // Check if already processed to avoid double-crediting
          // You might want to store session IDs in a processed sessions table
          await this.creditService.addCredits(
            userId,
            credits,
            CreditTransactionType.PURCHASE,
            `Stripe checkout - Plan: ${planType}, Session: ${sessionId}`,
          );
        }
      }

      return {
        verified,
        session: {
          id: session.id,
          payment_status: session.payment_status,
          customer_email: session.customer_email,
          amount_total: session.amount_total,
          metadata: session.metadata,
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        verified: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get Stripe session details
   */
  @Get('stripe-session-details')
  async getSessionDetails(@Query('session_id') sessionId: string) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items'],
      });

      return {
        session: {
          id: session.id,
          payment_status: session.payment_status,
          customer_email: session.customer_email,
          amount_total: session.amount_total,
          amount_subtotal: session.amount_subtotal,
          currency: session.currency,
          created: session.created,
          metadata: session.metadata,
          line_items: session.line_items,
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        error: errorMessage,
      };
    }
  }

  /**
   * Add credits after successful payment (simple endpoint)
   */
  @Post('purchase')
  async addPurchaseCredits(
    @Body()
    purchaseDto: {
      userId: string;
      credits: number;
      paymentId?: string;
    },
  ) {
    const transactionId = await this.creditService.addCredits(
      purchaseDto.userId,
      purchaseDto.credits,
      CreditTransactionType.PURCHASE,
      `Credit purchase via Stripe - Payment ID: ${purchaseDto.paymentId || 'N/A'}`,
    );

    const newBalance = await this.creditService.getUserBalance(
      purchaseDto.userId,
    );

    return {
      transactionId,
      newBalance: newBalance.toNumber(),
      message: `Successfully added ${purchaseDto.credits} credits`,
    };
  }
}
