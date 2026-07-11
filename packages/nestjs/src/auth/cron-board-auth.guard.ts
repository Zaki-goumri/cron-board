import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { CRON_BOARD_OPTIONS } from '../cron-board.constants.js';
import type { CronBoardModuleOptions } from '../cron-board.options.js';

/**
 * Basic Auth guard for CronBoard dashboard and API routes.
 * Also protects WebSocket connections via handshake headers.
 *
 * When opts.auth is omitted, the guard is a no-op (all requests pass).
 * Uses constant-time comparison to prevent timing attacks.
 */
@Injectable()
export class CronBoardAuthGuard implements CanActivate {
  constructor(
    @Inject(CRON_BOARD_OPTIONS) private readonly options: CronBoardModuleOptions,
  ) {}

  /**
   * Validates Basic Auth credentials against configured username/password.
   * @returns true if auth is disabled or credentials match
   * @throws UnauthorizedException when credentials are missing or invalid
   */
  canActivate(context: ExecutionContext): boolean {
    if (!this.options.auth) return true;

    const authHeader = this.extractAuthHeader(context);
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      this.setWwwAuthenticate(context);
      throw new UnauthorizedException('Authentication required');
    }

    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) {
      this.setWwwAuthenticate(context);
      throw new UnauthorizedException('Invalid Basic Auth format');
    }

    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const userMatches = this.safeCompare(username, this.options.auth.username);
    const passMatches = this.safeCompare(password, this.options.auth.password);

    if (!userMatches || !passMatches) {
      this.setWwwAuthenticate(context);
      throw new UnauthorizedException('Invalid credentials');
    }

    return true;
  }

  /**
   * Extract the Authorization header from HTTP or WebSocket context.
   */
  private extractAuthHeader(context: ExecutionContext): string | null {
    const type = context.getType<'http' | 'ws'>();

    if (type === 'http') {
      const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
      return request.headers['authorization'] ?? null;
    }

    if (type === 'ws') {
      const client = context.switchToWs().getClient<{ handshake?: { headers?: Record<string, string> } }>();
      return client?.handshake?.headers?.['authorization'] ?? null;
    }

    return null;
  }

  /**
   * Set WWW-Authenticate header on HTTP responses to trigger browser Basic Auth dialog.
   */
  private setWwwAuthenticate(context: ExecutionContext): void {
    if (context.getType() !== 'http') return;
    const response = context.switchToHttp().getResponse<{ setHeader?: (name: string, value: string) => void }>();
    response?.setHeader?.('WWW-Authenticate', 'Basic realm="CronBoard"');
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
