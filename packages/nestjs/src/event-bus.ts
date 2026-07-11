import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { CronBoardEvent } from 'cronboard-api';

/**
 * Internal event bus — bridges registry/service (producers) to the WebSocket gateway (consumer).
 * Uses RxJS Subject (rxjs is already a NestJS peer dep — no extra dependency).
 */
@Injectable()
export class CronBoardEventBus {
  private readonly _events$ = new Subject<CronBoardEvent>();

  /** Observable stream of board events — gateway subscribes to this. */
  get events$() {
    return this._events$.asObservable();
  }

  /** Push an event to all subscribers. */
  emit(event: CronBoardEvent): void {
    this._events$.next(event);
  }
}
