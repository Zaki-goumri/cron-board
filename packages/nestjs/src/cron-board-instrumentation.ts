import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { CronJob } from 'cron';
import {
  CRON_BOARD_STORAGE,
  ExecutionStatus,
  truncateTail,
  type CronBoardEvent,
  type CronBoardStorage,
  type ExecutionRecord,
} from 'cronboard-api';
import { CronBoardEventBus } from './event-bus.js';

/**
 * Patches SchedulerRegistry.addCronJob to instrument every cron job with
 * execution timing, error capture, and event emission.
 *
 * Why monkey-patch instead of subclassing:
 *   ScheduleModule is global:true and exports SchedulerRegistry.
 *   SchedulerOrchestrator (inside ScheduleModule) injects SchedulerRegistry
 *   from its own module scope. A subclass override in CronBoardModule would
 *   never reach the orchestrator. Patching the instance method during
 *   OnModuleInit (which runs BEFORE OnApplicationBootstrap where mountCron
 *   happens) ensures our wrapper is in place before any job is registered.
 *
 * Lifecycle:
 *   onModuleInit (all modules) → onApplicationBootstrap (all modules)
 *   ScheduleExplorer.onModuleInit stores metadata (no CronJob yet)
 *   CronBoardInstrumentation.onModuleInit patches addCronJob
 *   SchedulerOrchestrator.onApplicationBootstrap calls mountCron → patched addCronJob
 *
 * Fire chain when cron ticks:
 *   our wrapper (timing + error capture)
 *     → registry's wrapper (try/catch logger)
 *       → original fireOnTick
 *         → _callbacks (user handler)
 *   If user handler throws: our wrapper records 'failed' + re-throws
 *   → registry's wrapper catches + logs (existing behavior preserved)
 */
@Injectable()
export class CronBoardInstrumentation implements OnModuleInit {
  private readonly logger = new Logger(CronBoardInstrumentation.name);
  private patched = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(CRON_BOARD_STORAGE) private readonly storage: CronBoardStorage,
    private readonly eventBus: CronBoardEventBus,
  ) {}

  /**
   * Patches addCronJob on the SchedulerRegistry instance before any jobs are mounted.
   */
  onModuleInit(): void {
    this.patchAddCronJob();
  }

  /**
   * Replace addCronJob with a version that wraps fireOnTick before delegating to the original.
   * Idempotent — safe to call multiple times.
   */
  private patchAddCronJob(): void {
    if (this.patched) return;

    const registry = this.schedulerRegistry;
    const originalAddCronJob = registry.addCronJob.bind(registry);

    registry.addCronJob = (name: string, job: CronJob): void => {
      const originalFireOnTick = job.fireOnTick;

      const instrumented = async (...args: unknown[]): Promise<void> => {
        const startedAt = new Date();
        try {
          await originalFireOnTick.apply(job, args as []);
          this.recordExecution(name, startedAt, ExecutionStatus.Success, null);
        } catch (error) {
          this.recordExecution(name, startedAt, ExecutionStatus.Failed, error);
          throw error;
        }
      };

      job.fireOnTick = instrumented as unknown as typeof job.fireOnTick;
      originalAddCronJob(name, job);
    };

    this.patched = true;
    this.logger.log('SchedulerRegistry.addCronJob instrumented');
  }

  /**
   * Build and persist an ExecutionRecord, then emit it via the event bus.
   * Errors in storage/emit are caught and logged — instrumentation must never break the job.
   */
  private recordExecution(
    name: string,
    startedAt: Date,
    status: ExecutionStatus,
    error: unknown,
  ): void {
    let record: ExecutionRecord;
    try {
      const finishedAt = new Date();
      const err = error as Error | undefined;

      record = {
        id: crypto.randomUUID(),
        jobName: name,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        status,
        exitCode: status === ExecutionStatus.Success ? 0 : 1,
        stdoutTail: null,
        stderrTail: err?.message ? truncateTail(err.message) : null,
        error: err ? { message: err.message, stack: err.stack ?? null } : null,
      };

      this.storage.appendExecution(name, record);
    } catch (err) {
      this.logger.error(
        `Failed to record execution for "${name}"`,
        (err as Error).stack ?? undefined,
      );
      return;
    }

    try {
      this.eventBus.emit({ type: 'execution', record } satisfies CronBoardEvent);
    } catch (err) {
      this.logger.error(
        `Failed to emit execution event for "${name}"`,
        (err as Error).stack ?? undefined,
      );
    }
  }
}
