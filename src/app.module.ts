import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivityModule } from './activity/activity.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BidModule } from './bid/bid.module';
import { CollectionModule } from './collection/collection.module';
import { DatabaseModule } from './database/database.module';
import { FixService } from './fix.service';
import { IndexingService } from './indexing.service';
import { NftModule } from './nft/nft.module';
import { NotificationModule } from './notification/notification.module';
import { PinataModule } from './pinata/pinata.module';
import { ReportModule } from './report/report.module';
import { RewardsService } from './rewards.service';
import { RewardsModule } from './rewards/rewards.module';
import { SharedModule } from './shared/shared.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UserModule,
    NftModule,
    CollectionModule,
    PinataModule,
    BidModule,
    ReportModule,
    ActivityModule,
    NotificationModule,
    RewardsModule,
    SharedModule,
  ],
  controllers: [AppController],
  providers: [AppService, IndexingService, FixService, RewardsService],
})
export class AppModule {}
