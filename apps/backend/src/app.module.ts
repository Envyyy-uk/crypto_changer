import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BalancesModule } from './modules/balances/balances.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { MarketsModule } from './modules/markets/markets.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { P2pModule } from './modules/p2p/p2p.module';
import { TradesModule } from './modules/trades/trades.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AssetsModule,
    MarketsModule,
    LedgerModule,
    BalancesModule,
    OrdersModule,
    TradesModule,
    MarketDataModule,
    WalletsModule,
    AdminModule,
    NotificationsModule,
    AuditModule,
    P2pModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
