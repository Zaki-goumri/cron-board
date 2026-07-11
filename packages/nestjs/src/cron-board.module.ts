import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  type DynamicModule,
  Get,
  Logger,
  type OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
  SetMetadata,
  Type,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { dirname, join } from 'node:path';
import {
  CRON_BOARD_STORAGE,
  InMemoryStorage,
  type CronBoardStats,
  type CronBoardEvent,
  type CronBoardStorage,
  type CronJobSnapshot,
  type ExecutionRecord,
} from 'cronboard-api';
import { CRON_BOARD_OPTIONS } from './cron-board.constants.js';
import type { CronBoardModuleOptions } from './cron-board.options.js';
import { CronBoardEventBus } from './event-bus.js';
import { CronBoardInstrumentation } from './cron-board-instrumentation.js';
import { CronBoardService } from './cron-board.service.js';
import { CronBoardAuthGuard } from './auth/cron-board-auth.guard.js';

const WS_EVENT_NAME = 'cronboard:event';

/**
 * NestJS dynamic module that mounts a Bull-board-style dashboard for @nestjs/schedule cron jobs.
 *
 * Usage:
 * ```ts
 * @Module({
 *   imports: [
 *     ScheduleModule.forRoot(),
 *     CronBoardModule.forRoot({ route: '/cronboard', auth: { username: 'admin', password: 'secret' } }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * Requires `app.useWebSocketAdapter(new IoAdapter(app))` in main.ts for real-time updates.
 */
export class CronBoardModule {
  private static readonly logger = new Logger(CronBoardModule.name);

  /**
   * Configure and mount the CronBoard dashboard.
   * @param options - Module configuration
   * @returns DynamicModule with controller, gateway, service, guard, and instrumentation
   */
  static forRoot(options: CronBoardModuleOptions): DynamicModule {
    const apiPath = options.route.replace(/\/$/, '') + '/api';
    const storageProvider = options.storageClass
      ? { provide: CRON_BOARD_STORAGE, useClass: options.storageClass }
      : { provide: CRON_BOARD_STORAGE, useClass: InMemoryStorage };

    const moduleImports: Array<Type | DynamicModule> = [];

    try {
      const uiPkgPath = require.resolve('cronboard-ui/package.json');
      const uiDistPath = join(dirname(uiPkgPath), 'dist');

      const staticModule = ServeStaticModule.forRoot({
        rootPath: uiDistPath,
        serveRoot: options.route,
        exclude: [`${options.route}/api/{*path}`],
      });
      if (Array.isArray(staticModule)) {
        moduleImports.push(...staticModule);
      } else {
        moduleImports.push(staticModule);
      }
    } catch {
      CronBoardModule.logger.warn(
        'cronboard-ui not found — running in API-only mode. Install cronboard-ui for the full dashboard.',
      );
    }

    // Build class decorator — adds SetMetadata(publicKey, true) when configured
    // so the host app's global auth guard (e.g. JwtAuthGuard) bypasses CronBoard routes.
    const classDecorator = applyDecorators(
      Controller(apiPath),
      UseGuards(CronBoardAuthGuard),
      ...(options.publicKey ? [SetMetadata(options.publicKey, true)] : []),
    );

    @classDecorator
    class CronBoardController {
      constructor(private readonly service: CronBoardService) {}

      @Get('jobs')
      getJobs(): CronJobSnapshot[] {
        return this.service.getJobs();
      }

      @Get('jobs/:name')
      getJob(@Param('name') name: string): CronJobSnapshot {
        return this.service.getJob(name);
      }

      @Post('jobs/:name/pause')
      pauseJob(@Param('name') name: string): CronJobSnapshot {
        return this.service.pauseJob(name);
      }

      @Post('jobs/:name/resume')
      resumeJob(@Param('name') name: string): CronJobSnapshot {
        return this.service.resumeJob(name);
      }

      @Post('jobs/:name/trigger')
      triggerJob(@Param('name') name: string): { triggered: string } {
        this.service.triggerJob(name);
        return { triggered: name };
      }

      @Patch('jobs/:name')
      updateSchedule(
        @Param('name') name: string,
        @Body() body: { cronExpression: string },
      ): CronJobSnapshot {
        if (!body?.cronExpression || typeof body.cronExpression !== 'string') {
          throw new BadRequestException('cronExpression is required');
        }
        return this.service.updateSchedule(name, body.cronExpression);
      }

      @Delete('jobs/:name')
      deleteJob(@Param('name') name: string): { deleted: string } {
        this.service.deleteJob(name);
        return { deleted: name };
      }

      @Get('executions')
      async getExecutions(
        @Query('jobName') jobName?: string,
        @Query('limit') limit?: string,
      ): Promise<ExecutionRecord[]> {
        return this.service.getExecutions(jobName, limit ? parseInt(limit, 10) : undefined);
      }

      @Get('executions/:id')
      async getExecution(@Param('id') id: string): Promise<ExecutionRecord> {
        return this.service.getExecution(id);
      }

      @Get('stats')
      getStats(): CronBoardStats {
        return this.service.getStats();
      }
    }

    const gatewayDecorator = applyDecorators(
      WebSocketGateway({ namespace: options.route, cors: true }),
      UseGuards(CronBoardAuthGuard),
      ...(options.publicKey ? [SetMetadata(options.publicKey, true)] : []),
    );

    @gatewayDecorator
    class CronBoardGateway implements OnModuleInit, OnGatewayConnection {
      @WebSocketServer() server!: Server;

      constructor(
        private readonly eventBus: CronBoardEventBus,
        private readonly service: CronBoardService,
      ) {}

      onModuleInit(): void {
        this.eventBus.events$.subscribe((event: CronBoardEvent) => {
          if (this.server) {
            this.server.emit(WS_EVENT_NAME, event);
          }
        });
      }

      handleConnection(client: Socket): void {
        client.emit(WS_EVENT_NAME, {
          type: 'snapshot',
          jobs: this.service.getJobs(),
        } satisfies CronBoardEvent);
      }
    }

    return {
      module: CronBoardModule,
      imports: moduleImports,
      providers: [
        { provide: CRON_BOARD_OPTIONS, useValue: options },
        storageProvider,
        CronBoardEventBus,
        CronBoardInstrumentation,
        CronBoardService,
        CronBoardAuthGuard,
        CronBoardGateway,
      ],
      controllers: [CronBoardController],
      exports: [CronBoardService],
    };
  }
}
