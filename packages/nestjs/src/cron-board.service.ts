import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronTime, validateCronExpression, type CronJob } from 'cron';
import {
  CRON_BOARD_STORAGE,
  ControlAction,
  type CronBoardStats,
  type CronBoardStorage,
  type CronJobSnapshot,
  type ExecutionRecord,
} from 'cronboard-api';
import { CronBoardEventBus } from './event-bus.js';

const UPCOMING_DATES_COUNT = 5;

/**
 * Read-side and control service for cron jobs.
 * Builds snapshots from SchedulerRegistry, performs control actions
 * (pause/resume/trigger/update/delete), and reads execution history from storage.
 */
@Injectable()
export class CronBoardService {
  private readonly logger = new Logger(CronBoardService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(CRON_BOARD_STORAGE) private readonly storage: CronBoardStorage,
    private readonly eventBus: CronBoardEventBus,
  ) {}

  /**
   * List all registered cron jobs as snapshots.
   * @returns Array of CronJobSnapshot, one per registered job
   */
  getJobs(): CronJobSnapshot[] {
    const cronJobs = this.schedulerRegistry.getCronJobs();
    const snapshots: CronJobSnapshot[] = [];
    for (const [name, job] of cronJobs) {
      snapshots.push(this.buildSnapshot(name, job));
    }
    return snapshots;
  }

  /**
   * Get a single job snapshot by name.
   * @param name - Registry key of the job
   * @returns CronJobSnapshot
   * @throws NotFoundException when job does not exist
   */
  getJob(name: string): CronJobSnapshot {
    const job = this.getJobOrThrow(name);
    return this.buildSnapshot(name, job);
  }

  /**
   * Pause a cron job (calls job.stop()).
   * @param name - Registry key of the job
   * @returns Updated snapshot with isActive: false
   * @throws NotFoundException when job does not exist
   */
  pauseJob(name: string): CronJobSnapshot {
    const job = this.getJobOrThrow(name);
    job.stop();
    const snapshot = this.buildSnapshot(name, job);
    this.eventBus.emit({ type: 'job', action: ControlAction.Paused, job: snapshot });
    return snapshot;
  }

  /**
   * Resume a paused cron job (calls job.start()).
   * @param name - Registry key of the job
   * @returns Updated snapshot with isActive: true
   * @throws NotFoundException when job does not exist
   */
  resumeJob(name: string): CronJobSnapshot {
    const job = this.getJobOrThrow(name);
    job.start();
    const snapshot = this.buildSnapshot(name, job);
    this.eventBus.emit({ type: 'job', action: ControlAction.Resumed, job: snapshot });
    return snapshot;
  }

  /**
   * Manually trigger a cron job immediately (calls job.fireOnTick()).
   * @param name - Registry key of the job
   * @throws NotFoundException when job does not exist
   */
  triggerJob(name: string): void {
    const job = this.getJobOrThrow(name);
    job.fireOnTick();
    const snapshot = this.buildSnapshot(name, job);
    this.eventBus.emit({ type: 'job', action: ControlAction.Triggered, job: snapshot });
  }

  /**
   * Update a job's cron expression (calls job.setTime(new CronTime(expr))).
   * If the job is currently active, it is stopped and restarted to pick up the new schedule.
   * @param name - Registry key of the job
   * @param cronExpression - New cron expression (e.g. "0 10 * * *")
   * @returns Updated snapshot with the new schedule
   * @throws NotFoundException when job does not exist
   * @throws BadRequestException when cron expression is invalid
   */
  updateSchedule(name: string, cronExpression: string): CronJobSnapshot {
    const validation = validateCronExpression(cronExpression);
    if (!validation.valid) {
      throw new BadRequestException(`Invalid cron expression: ${validation.error}`);
    }
    const job = this.getJobOrThrow(name);
    job.setTime(new CronTime(cronExpression));
    if (job.isActive) {
      job.stop();
      job.start();
    }
    const snapshot = this.buildSnapshot(name, job);
    this.eventBus.emit({ type: 'job', action: ControlAction.Updated, job: snapshot });
    return snapshot;
  }

  /**
   * Delete a cron job from the registry.
   * @param name - Registry key of the job
   * @throws NotFoundException when job does not exist
   */
  deleteJob(name: string): void {
    if (!this.schedulerRegistry.doesExist('cron', name)) {
      throw new NotFoundException(`Cron job "${name}" not found`);
    }
    this.schedulerRegistry.deleteCronJob(name);
    this.eventBus.emit({
      type: 'job',
      action: ControlAction.Deleted,
      job: { name } as CronJobSnapshot,
    });
  }

  /**
   * List execution records from storage.
   * @param jobName - Filter by job name, undefined for all jobs
   * @param limit - Max records to return (default 50)
   * @returns ExecutionRecord[], newest-first
   */
  async getExecutions(jobName?: string, limit?: number): Promise<ExecutionRecord[]> {
    return this.storage.listExecutions(jobName, limit);
  }

  /**
   * Get a single execution record by ID.
   * @param id - Execution record UUID
   * @returns ExecutionRecord
   * @throws NotFoundException when record does not exist
   */
  async getExecution(id: string): Promise<ExecutionRecord> {
    const record = await this.storage.getExecution(id);
    if (!record) throw new NotFoundException(`Execution "${id}" not found`);
    return record;
  }

  /**
   * Aggregate statistics: job counts from registry, 24h counters from storage.
   * @returns CronBoardStats
   */
  getStats(): CronBoardStats {
    const cronJobs = this.schedulerRegistry.getCronJobs();
    let total = 0;
    let active = 0;
    for (const [, job] of cronJobs) {
      total++;
      if (job.isActive) active++;
    }
    return this.storage.getStats({ total, active, disabled: total - active });
  }

  /**
   * Get a CronJob from the registry or throw NotFoundException.
   */
  private getJobOrThrow(name: string): CronJob {
    try {
      return this.schedulerRegistry.getCronJob(name);
    } catch {
      throw new NotFoundException(`Cron job "${name}" not found`);
    }
  }

  /**
   * Build a CronJobSnapshot from a CronJob instance.
   * Reads cron v4 properties: isActive, isCallbackRunning, lastDate(), nextDates().
   */
  private buildSnapshot(name: string, job: CronJob): CronJobSnapshot {
    let nextDate: Date | null = null;
    let upcomingDates: Date[] = [];

    try {
      const next = job.nextDates(UPCOMING_DATES_COUNT);
      const dates = Array.isArray(next) ? next : [next];
      upcomingDates = dates.map((d) => d.toJSDate());
      nextDate = upcomingDates[0] ?? null;
    } catch {
      // nextDates may throw if job is stopped or cron time is invalid
    }

    const lastDate = job.lastDate();

    // cronTime.source and cronTime.zone are not exposed in cron v4 type definitions
    const cronTime = job.cronTime as unknown as {
      source: string;
      zone?: { name: string };
    };

    const tzName = cronTime.zone?.name ?? null;

    return {
      name,
      cronExpression: cronTime.source ?? 'unknown',
      isActive: job.isActive,
      isCallbackRunning: job.isCallbackRunning,
      lastDate: lastDate ?? null,
      nextDate,
      upcomingDates,
      timezone: tzName === 'UTC' || !tzName ? null : tzName,
      waitForCompletion: job.waitForCompletion,
      disabled: false,
      threshold: job.threshold,
      tags: [],
    };
  }
}
