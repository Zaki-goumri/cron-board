import type { CronBoardModuleOptions } from './cron-board.options.js';

/** DI token for the module options object passed to forRoot(). */
export const CRON_BOARD_OPTIONS = Symbol('CRON_BOARD_OPTIONS');
export type CronBoardOptionsType = CronBoardModuleOptions;
