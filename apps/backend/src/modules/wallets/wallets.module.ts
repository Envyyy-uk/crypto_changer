import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [AssetsModule, LedgerModule],
  controllers: [WalletsController],
  providers: [WalletsService],
})
export class WalletsModule {}
