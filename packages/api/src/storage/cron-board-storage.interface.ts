import type { CronBoardStats, ExecutionRecord } from '../types.js';

/**
 * Persistence interface for execution history and aggregate stats.
 * Implemented by InMemoryStorage (default) and RedisStorage (optional).
 */
export interface CronBoardStorage {
  /**
   * Append an execution record for a job.
   * Implementations should cap per-job history (e.g. ring buffer of 100).
   * @param jobName - Registry key of the job
   * @param record - The execution record to persist
   */
  appendExecution(jobName: string, record: ExecutionRecord): void | Promise<void>;

  /**
   * List execution records, newest-first.
   * @param jobName - Filter by job name, undefined for all jobs
   * @param limit - Max records to return (default 50)
   */
  listExecutions(jobName?: string, limit?: number): Promise<ExecutionRecord[]>;

  /**
   * Get a single execution record by ID.
   * @returns The record, or null if not found
   */
  getExecution(id: string): Promise<ExecutionRecord | null>;

  /**
   * Aggregate stats: job counts from caller, 24h counters from stored records.
   * @param jobCounts - { total, active, disabled } — provided by CronBoardService
   */
  getStats(jobCounts: { total: number; active: number; disabled: number }): CronBoardStats;

  /**
   * Clear execution history.
   * @param jobName - Clear only this job's history, undefined for all
   */
  clear(jobName?: string): void | Promise<void>;
}

/**
 * DI token for CronBoardStorage.
 * Default binding: InMemoryStorage. Override with RedisStorage via forRoot({ storage: 'redis' }).
 */
export const CRON_BOARD_STORAGE = Symbol('CRON_BOARD_STORAGE');
