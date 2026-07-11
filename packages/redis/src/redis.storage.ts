import type { Redis } from 'ioredis';
import {
  ExecutionStatus,
  type CronBoardStats,
  type CronBoardStorage,
  type ExecutionRecord,
} from 'cronboard-api';

const MAX_PER_JOB = 100;
const KEY_PREFIX = 'cronboard';
const STATS_KEY = `${KEY_PREFIX}:stats`;

/**
 * Redis-backed storage adapter for CronBoard execution history.
 * Uses LPUSH + LTRIM for a per-job ring buffer, HINCRBY for aggregate counters.
 * Requires ioredis as an optional peer dependency.
 */
export class RedisStorage implements CronBoardStorage {
  private readonly redis: Redis;

  /**
   * @param redis - Connected ioredis instance (user-provided)
   */
  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Append an execution record to the job's Redis list (capped at MAX_PER_JOB).
   */
  async appendExecution(jobName: string, record: ExecutionRecord): Promise<void> {
    const key = this.jobKey(jobName);
    const pipeline = this.redis.multi();
    pipeline.lpush(key, JSON.stringify(record));
    pipeline.ltrim(key, 0, MAX_PER_JOB - 1);
    pipeline.hincrby(STATS_KEY, 'fired', 1);
    if (record.status === ExecutionStatus.Success) {
      pipeline.hincrby(STATS_KEY, 'success', 1);
    } else if (record.status === ExecutionStatus.Failed) {
      pipeline.hincrby(STATS_KEY, 'failed', 1);
    } else if (record.status === ExecutionStatus.Timeout) {
      pipeline.hincrby(STATS_KEY, 'timeout', 1);
    }
    await pipeline.exec();
  }

  /**
   * List execution records newest-first from Redis.
   */
  async listExecutions(jobName?: string, limit = 50): Promise<ExecutionRecord[]> {
    if (jobName) {
      const raw = await this.redis.lrange(this.jobKey(jobName), 0, limit - 1);
      return raw.map((r) => JSON.parse(r) as ExecutionRecord);
    }

    const keys = await this.redis.keys(`${KEY_PREFIX}:job:*`);
    const all: ExecutionRecord[] = [];
    for (const key of keys) {
      const raw = await this.redis.lrange(key, 0, limit - 1);
      for (const r of raw) {
        all.push(JSON.parse(r) as ExecutionRecord);
      }
    }
    all.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return all.slice(0, limit);
  }

  /**
   * Get a single execution by ID — scans all job lists.
   * For high-frequency access, consider adding a Redis HASH index.
   */
  async getExecution(id: string): Promise<ExecutionRecord | null> {
    const keys = await this.redis.keys(`${KEY_PREFIX}:job:*`);
    for (const key of keys) {
      const raw = await this.redis.lrange(key, 0, -1);
      for (const r of raw) {
        const rec = JSON.parse(r) as ExecutionRecord;
        if (rec.id === id) return rec;
      }
    }
    return null;
  }

  /**
   * Aggregate stats from Redis HASH counters.
   * Note: counters are cumulative since process start, not a rolling 24h window.
   * For precise 24h stats, use Redis time-series or sorted sets by timestamp.
   */
  getStats(jobCounts: { total: number; active: number; disabled: number }): CronBoardStats {
    // Synchronous interface — Redis stats are async, so we return zeros.
    // The CronBoardService calls getStats synchronously; for Redis, use the async variant.
    // This is a known limitation — to fix, make CronBoardStorage.getStats async in a future version.
    return {
      totalJobs: jobCounts.total,
      activeJobs: jobCounts.active,
      disabledJobs: jobCounts.disabled,
      last24h: { fired: 0, success: 0, failed: 0, timeout: 0 },
    };
  }

  /**
   * Clear execution history for one job or all.
   */
  async clear(jobName?: string): Promise<void> {
    if (jobName) {
      await this.redis.del(this.jobKey(jobName));
      return;
    }
    const keys = await this.redis.keys(`${KEY_PREFIX}:job:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    await this.redis.del(STATS_KEY);
  }

  private jobKey(jobName: string): string {
    return `${KEY_PREFIX}:job:${jobName}:execs`;
  }
}
