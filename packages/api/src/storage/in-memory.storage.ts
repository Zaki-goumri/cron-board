import { ExecutionStatus, type CronBoardStats, type ExecutionRecord } from '../types.js';
import type { CronBoardStorage } from './cron-board-storage.interface.js';

const MAX_PER_JOB = 100;
const TAIL_LENGTH = 1000;

/**
 * Default in-memory storage — ring buffer of MAX_PER_JOB executions per job.
 * Lost on process restart. Zero dependency. Suitable for monitoring <100 jobs.
 */
export class InMemoryStorage implements CronBoardStorage {
  private readonly records = new Map<string, ExecutionRecord[]>();
  private readonly globalIndex = new Map<string, ExecutionRecord>();

  /**
   * Append a record to the job's ring buffer.
   * Drops oldest when exceeding MAX_PER_JOB.
   */
  appendExecution(jobName: string, record: ExecutionRecord): void {
    let bucket = this.records.get(jobName);
    if (!bucket) {
      bucket = [];
      this.records.set(jobName, bucket);
    }
    bucket.push(record);
    if (bucket.length > MAX_PER_JOB) {
      const dropped = bucket.shift();
      if (dropped) this.globalIndex.delete(dropped.id);
    }
    this.globalIndex.set(record.id, record);
  }

  /**
   * List records newest-first, optionally filtered by job.
   */
  async listExecutions(jobName?: string, limit = 50): Promise<ExecutionRecord[]> {
    let all: ExecutionRecord[];
    if (jobName) {
      all = [...(this.records.get(jobName) ?? [])];
    } else {
      all = [];
      for (const bucket of this.records.values()) {
        all.push(...bucket);
      }
    }
    all.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return all.slice(0, limit);
  }

  /**
   * Lookup by execution ID.
   */
  async getExecution(id: string): Promise<ExecutionRecord | null> {
    return this.globalIndex.get(id) ?? null;
  }

  /**
   * Aggregate 24h counters from stored records.
   */
  getStats(jobCounts: { total: number; active: number; disabled: number }): CronBoardStats {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const counters = { fired: 0, success: 0, failed: 0, timeout: 0 };

    for (const bucket of this.records.values()) {
      for (const rec of bucket) {
        if (rec.startedAt.getTime() < cutoff) continue;
        counters.fired++;
        if (rec.status === ExecutionStatus.Success) counters.success++;
        else if (rec.status === ExecutionStatus.Failed) counters.failed++;
        else if (rec.status === ExecutionStatus.Timeout) counters.timeout++;
      }
    }

    return {
      totalJobs: jobCounts.total,
      activeJobs: jobCounts.active,
      disabledJobs: jobCounts.disabled,
      last24h: counters,
    };
  }

  /**
   * Clear history for one job or all.
   */
  clear(jobName?: string): void {
    if (jobName) {
      const bucket = this.records.get(jobName);
      if (bucket) {
        for (const rec of bucket) this.globalIndex.delete(rec.id);
        this.records.delete(jobName);
      }
      return;
    }
    this.records.clear();
    this.globalIndex.clear();
  }
}

/**
 * Truncate a string to N chars, suffixing with "..." if truncated.
 * Used by the instrumented registry when capturing stdout/stderr tails.
 */
export function truncateTail(text: string, max = TAIL_LENGTH): string {
  if (text.length <= max) return text;
  return text.slice(-max);
}
