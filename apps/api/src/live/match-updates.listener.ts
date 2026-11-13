import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Client } from 'pg';
import { filter, map, type Observable, Subject } from 'rxjs';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MATCH_UPDATES_CHANNEL, type MatchUpdateNotice } from '../matches/match-notify';

/** Sent after a reconnect: notifications may have been missed, so every stream re-checks. */
const EVERY_MATCH = '*';

/**
 * Holds one dedicated (non-pooled) connection per API instance that LISTENs for committed
 * match updates and fans them out to this instance's SSE streams (ADR 0002). A missed
 * notification only delays an update: streams re-read from their last sent version.
 */
@Injectable()
export class MatchUpdatesListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchUpdatesListener.name);
  private readonly notices = new Subject<MatchUpdateNotice>();
  private client: Client | null = null;
  private stopped = false;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.notices.complete();
    await this.client?.end().catch(() => undefined);
  }

  /** Emits whenever the match may have changed. */
  updates(matchId: string): Observable<void> {
    return this.notices.pipe(
      filter((n) => n.matchId === matchId || n.matchId === EVERY_MATCH),
      map(() => undefined),
    );
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: this.env.DATABASE_URL });
    client.on('notification', (msg) => {
      if (msg.channel !== MATCH_UPDATES_CHANNEL || !msg.payload) return;
      try {
        this.notices.next(JSON.parse(msg.payload) as MatchUpdateNotice);
      } catch {
        this.logger.warn('Ignored a malformed match update notice');
      }
    });
    client.on('error', (error) => {
      this.logger.warn(`Match update listener lost its connection: ${error.message}`);
      this.reconnectSoon(client);
    });
    client.on('end', () => this.reconnectSoon(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${MATCH_UPDATES_CHANNEL}`);
      this.client = client;
      this.notices.next({ matchId: EVERY_MATCH, version: 0 });
    } catch (error) {
      this.logger.warn(`Match update listener could not connect: ${(error as Error).message}`);
      this.reconnectSoon(client);
    }
  }

  private reconnectSoon(failed: Client): void {
    if (this.stopped || this.retryTimer || (this.client && this.client !== failed)) return;
    this.client = null;
    failed.removeAllListeners('notification');
    void failed.end().catch(() => undefined);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, 1_000);
  }
}
