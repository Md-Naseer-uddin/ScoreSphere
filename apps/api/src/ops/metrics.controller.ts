import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { RawResponse } from '../common/envelope.interceptor';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { LiveService } from '../live/live.service';

type Row = Record<string, unknown>;

/**
 * Prometheus metrics for the alerts in the runbooks: matches by status, matches needing
 * review, live matches whose scorer has gone quiet, refused events and open live streams.
 * Device sync backlogs aren't visible to the server; quiet scorers and refusals are the proxy.
 */
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly live: LiveService,
  ) {}

  @Get()
  @RawResponse()
  async metrics(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = this.env.METRICS_TOKEN;
    if (!token || req.headers.authorization !== `Bearer ${token}`) {
      throw new ApiError(404, 'NOT_FOUND', 'Not found.');
    }
    const rows = async (query: ReturnType<typeof sql>) =>
      (await this.db.execute(query)).rows as Row[];
    const [statuses, [review], [quiet], [events], rejections] = await Promise.all([
      rows(sql`select status, count(*)::int as n from matches group by status`),
      rows(sql`select count(*)::int as n from matches where needs_review`),
      rows(sql`select count(*)::int as n from matches where status = 'live'
               and (scorer_seen_at is null or scorer_seen_at < now() - interval '5 minutes')`),
      rows(sql`select count(*)::int as n from match_events`),
      rows(sql`select code, count(*)::int as n from match_event_rejections group by code`),
    ]);
    const lines = [
      '# HELP scoresphere_matches Matches by status.',
      '# TYPE scoresphere_matches gauge',
      ...statuses.map((r) => `scoresphere_matches{status="${String(r.status)}"} ${Number(r.n)}`),
      '# HELP scoresphere_matches_needs_review Matches whose events the server engine disagreed with.',
      '# TYPE scoresphere_matches_needs_review gauge',
      `scoresphere_matches_needs_review ${Number(review?.n ?? 0)}`,
      '# HELP scoresphere_live_matches_scorer_quiet Live matches whose scorer has not reached the server for 5 minutes.',
      '# TYPE scoresphere_live_matches_scorer_quiet gauge',
      `scoresphere_live_matches_scorer_quiet ${Number(quiet?.n ?? 0)}`,
      '# HELP scoresphere_match_events_total Ledger events stored.',
      '# TYPE scoresphere_match_events_total counter',
      `scoresphere_match_events_total ${Number(events?.n ?? 0)}`,
      '# HELP scoresphere_event_rejections_total Events refused and kept, by reason.',
      '# TYPE scoresphere_event_rejections_total counter',
      ...rejections.map(
        (r) => `scoresphere_event_rejections_total{code="${String(r.code)}"} ${Number(r.n)}`,
      ),
      '# HELP scoresphere_sse_connections Open live streams on this instance.',
      '# TYPE scoresphere_sse_connections gauge',
      `scoresphere_sse_connections ${this.live.openStreams}`,
      '# HELP scoresphere_build_info Running version.',
      '# TYPE scoresphere_build_info gauge',
      `scoresphere_build_info{version="${this.env.APP_VERSION}"} 1`,
    ];
    res
      .status(200)
      .type('text/plain; version=0.0.4')
      .send(`${lines.join('\n')}\n`);
  }
}
