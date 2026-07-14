import { Module } from '@nestjs/common';
import { BalancesModule } from '../balances/balances.module';
import { MarketsModule } from '../markets/markets.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [MarketsModule, BalancesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
