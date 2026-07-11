/**
 * Snapshot of a registered cron job at a point in time.
 * Read from @nestjs/schedule's SchedulerRegistry + cron package's CronJob.
 */
export interface CronJobSnapshot {
  /** Registry key — options.name or auto-generated UUID */
  name: string;
  /** Cron expression (e.g. "0 5 * * *") or preset (@daily) */
  cronExpression: string;
  /** Human-readable description via cronstrue (filled by UI, optional here) */
  description?: string;
  /** Job is started and ticking (cron v4 `isActive`) */
  isActive: boolean;
  /** onTick callback currently executing */
  isCallbackRunning: boolean;
  /** Last successful fire timestamp, null until first run */
  lastDate: Date | null;
  /** Next scheduled fire timestamp */
  nextDate: Date | null;
  /** Upcoming N fires (default 5), empty if cannot compute */
  upcomingDates: Date[];
  /** IANA timezone (e.g. "America/New_York"), null if UTC */
  timezone: string | null;
  /** Whether job waits for completion before next tick */
  waitForCompletion: boolean;
  /** Job created with disabled: true — registered but not started */
  disabled: boolean;
  /** Skip-vs-execute window for missed deadlines (ms) */
  threshold: number;
  /** User-assigned tags for grouping (future: decorator metadata) */
  tags: string[];
}

/**
 * Record of a single job execution — appended to storage on every fire.
 */
export interface ExecutionRecord {
  /** Unique ID per execution (crypto.randomUUID()) */
  id: string;
  /** Registry key of the job that ran */
  jobName: string;
  /** When fireOnTick was invoked */
  startedAt: Date;
  /** When the wrapped callback returned/threw */
  finishedAt: Date;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Outcome of the execution */
  status: ExecutionStatus;
  /** Process exit code analog — 0 for success, 1 for error, null if N/A */
  exitCode: number | null;
  /** Last 1000 chars of stdout (console.log within the handler) */
  stdoutTail: string | null;
  /** Last 1000 chars of stderr (captured errors) */
  stderrTail: string | null;
  /** Error message + stack if status is "failed" */
  error: { message: string; stack: string | null } | null;
}

/**
 * Execution outcome.
 * as const + typeof — no enum.
 */
export const ExecutionStatus = {
  Success: 'success',
  Failed: 'failed',
  Timeout: 'timeout',
  Skipped: 'skipped',
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

/**
 * Event emitted when a control action is performed on a job.
 * Used by the WebSocket gateway to broadcast changes.
 */
export const ControlAction = {
  Paused: 'paused',
  Resumed: 'resumed',
  Triggered: 'triggered',
  Updated: 'updated',
  Deleted: 'deleted',
  Fired: 'fired',
} as const;
export type ControlAction = (typeof ControlAction)[keyof typeof ControlAction];

/**
 * Payload pushed via WebSocket to connected dashboard clients.
 */
export type CronBoardEvent =
  | { type: 'snapshot'; jobs: CronJobSnapshot[] }
  | { type: 'job'; action: ControlAction; job: CronJobSnapshot }
  | { type: 'execution'; record: ExecutionRecord }
  | { type: 'stats'; stats: CronBoardStats };

/**
 * Aggregate statistics over recent executions.
 */
export interface CronBoardStats {
  totalJobs: number;
  activeJobs: number;
  disabledJobs: number;
  /** Last 24h counters */
  last24h: {
    fired: number;
    success: number;
    failed: number;
    timeout: number;
  };
}

/**
 * Validates a cron expression before saving via PATCH.
 */
export interface CronValidationResult {
  valid: boolean;
  error: string | null;
}
