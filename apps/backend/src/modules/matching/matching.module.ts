import { Module } from '@nestjs/common';
import { BalancesModule } from '../balances/balances.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MatchingService } from './matching.service';

@Module({
  imports: [BalancesModule, LedgerModule],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
