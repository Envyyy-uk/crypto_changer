import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';
import { MarketMakerModule } from '../market-maker/market-maker.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AssetsModule, AuditModule, LedgerModule, MarketMakerModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
