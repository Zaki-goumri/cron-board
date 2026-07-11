import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression, ScheduleModule } from '@nestjs/schedule';
import { CronBoardModule } from 'cronboard-nestjs';

@Injectable()
export class SampleJobsService {
  private readonly logger = new Logger(SampleJobsService.name);

  @Cron(CronExpression.EVERY_MINUTE, { name: 'heartbeat' })
  heartbeat(): void {
    this.logger.log('Heartbeat tick');
  }

  @Cron('*/5 * * * *', { name: 'sync-data' })
  syncData(): void {
    this.logger.log('Syncing data...');
  }

  @Cron('0 * * * *', { name: 'cleanup-logs', timeZone: 'UTC' })
  cleanupLogs(): void {
    this.logger.log('Cleaning up old logs');
  }
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CronBoardModule.forRoot({
      route: '/cronboard',
      auth: { username: 'admin', password: 'secret' },
    }),
  ],
  providers: [SampleJobsService],
})
export class AppModule {}
