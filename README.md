# CronBoard

> Bull-board-style dashboard for `@nestjs/schedule` cron jobs.

A NestJS module you mount in your app to monitor and control `@Cron()`, `@Interval()`, and `@Timeout()` jobs — live status, execution history, pause/resume, manual trigger, schedule editing, all from a web UI.

## Quick Start

```bash
pnpm add cronboard-nestjs @nestjs/schedule
```

```ts
@Module({
  imports: [
    ScheduleModule.forRoot(),
    CronBoardModule.forRoot({
      route: '/cronboard',
      auth: { username: 'admin', password: 'secret' },
    }),
  ],
})
export class AppModule {}
```

Visit `http://localhost:3000/cronboard`.

## Packages

| Package | Description |
|---------|-------------|
| `cronboard-nestjs` | NestJS dynamic module — mount and configure |
| `cronboard-api` | Core types and storage interface |
| `cronboard-redis` | Optional Redis-backed execution history |
| `cronboard-ui` | Pre-built React dashboard SPA |

## Features

- Live job status (active, running, next run, last run)
- Execution history with stdout/stderr capture
- Pause / resume / trigger now / edit schedule / delete
- WebSocket push for real-time updates
- In-memory storage by default, Redis optional
- Basic auth built-in, or plug in your own guard

## License

MIT
