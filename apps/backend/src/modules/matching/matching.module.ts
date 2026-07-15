import { Module } from '@nestjs/common';
import { BalancesModule } from '../balances/balances.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [BalancesModule, LedgerModule],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
