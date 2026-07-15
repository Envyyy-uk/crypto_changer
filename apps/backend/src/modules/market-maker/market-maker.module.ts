import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { OrdersModule } from '../orders/orders.module';
import { MarketMakerService } from './market-maker.service';

@Module({
  imports: [LedgerModule, OrdersModule, MarketDataModule],
  providers: [MarketMakerService],
})
export class MarketMakerModule {}
