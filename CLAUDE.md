# CronBoard — Project Conventions

## Stack
- **Monorepo**: pnpm workspaces (`packages/*`, `examples/*`)
- **Language**: TypeScript strict mode (NodeNext modules, ES2022 target)
- **Node**: >= 20
- **Package manager**: `pnpm` only — never `npm` or `yarn`

## Packages
| Package | npm name | Purpose |
|---------|----------|---------|
| `packages/api` | `cronboard-api` | Framework-agnostic core: types, storage interface, in-memory storage |
| `packages/nestjs` | `cronboard-nestjs` | NestJS dynamic module, controller, gateway, instrumentation |
| `packages/redis` | `cronboard-redis` | Optional Redis storage adapter (peer dep: `ioredis`) |
| `packages/ui` | `cronboard-ui` | React + Vite dashboard SPA, pre-built `dist/` |
| `examples/usage` | `cronboard-example` | Dogfood NestJS app with 3 `@Cron` jobs |

## TypeScript Rules
- No `enum` — use `as const` + `typeof`
- No `any` without a comment explaining why
- Explicit return types on all exported methods
- JSDoc on all exported classes and public methods

## NestJS Rules
- `new Logger(ClassName.name)` — never `console.log`
- `ConfigService.getOrThrow()` — never `process.env`
- `HttpException` with correct HTTP status — never generic `Error`
- Thin controllers delegate to services

## Build
- Backend packages: `tsup` (ESM/CJS dual output)
- UI package: `vite build` → `dist/`
- Root: `pnpm build` runs all

## Git
- Conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`, `refactor(scope):`
- Branch prefixes: `feat/`, `fix/`, `chore/`, `refactor/`

## Testing
- `vitest` for unit/integration tests
- Test files colocated: `*.spec.ts`
- Write test first (red), then implement (green)

## ai_logs
Every session appends to `ai_logs/<YYYY-MM-DD>.md`:
- Prompt summary
- Files changed
- Highlights of non-obvious changes
