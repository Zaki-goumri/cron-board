import type { Type } from '@nestjs/common';
import type { CronBoardStorage } from 'cronboard-api';

/**
 * Configuration for CronBoardModule.forRoot().
 */
export interface CronBoardModuleOptions {
  /** URL path where the dashboard is mounted (e.g. '/cronboard'). Must start with '/'. */
  route: string;
  /** Basic auth credentials. Omit to disable auth (not recommended in production). */
  auth?: {
    username: string;
    password: string;
  };
  /** Custom storage class implementing CronBoardStorage. Default: InMemoryStorage. */
  storageClass?: Type<CronBoardStorage>;
  /** Max execution records kept per job (default 100). Older records are dropped. */
  maxRecordsPerJob?: number;
  /**
   * Metadata key to bypass the host app's global auth guard (e.g. JwtAuthGuard).
   * When set, SetMetadata(publicKey, true) is applied to the CronBoard controller
   * and gateway, so the host's global guard skips them.
   * Common values: 'isPublic' (NestJS convention), 'IS_PUBLIC_KEY'.
   */
  publicKey?: string;
}
