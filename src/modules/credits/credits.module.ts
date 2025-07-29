import { Module } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditTransactionService } from './credit-transaction.service';
import { CreditController } from './credit.controller';

@Module({
  controllers: [CreditController],
  providers: [CreditService, CreditTransactionService],
  exports: [CreditService, CreditTransactionService],
})
export class CreditsModule {}
