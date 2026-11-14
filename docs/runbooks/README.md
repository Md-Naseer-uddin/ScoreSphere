# Runbooks

Short, step-by-step procedures for running ScoreSphere in production (plan M6). Each one
says how you notice the problem, what to do, and how to confirm it is fixed.

| Runbook | When |
|---|---|
| [Deploy](deploy.md) | Shipping a new API or web version |
| [Backup and restore drill](backup-restore.md) | Nightly backups; monthly restore drill; recovering from data loss |
| [Lost or stolen device](lost-device.md) | A scorer's phone is lost mid-season |
| [Leaked share link](leaked-share-link.md) | A live link is being passed around where it shouldn't be |
| [Bad engine release](bad-engine-release.md) | A scoring engine version computes something wrong |
| [Sync backlog](sync-backlog.md) | Devices aren't getting their events onto the server |
| [Load testing](load-testing.md) | Before a release that touches ingestion or live streams, or a big event |

## Alerts

Scrape `GET /api/v1/metrics` with `Authorization: Bearer $METRICS_TOKEN`. Suggested alerts:

| Metric | Alert when | Runbook |
|---|---|---|
| `scoresphere_matches_needs_review` | rises | [Bad engine release](bad-engine-release.md) |
| `scoresphere_event_rejections_total` | rate jumps, especially `SEQ_GAP` or `BAD_PAYLOAD` | [Sync backlog](sync-backlog.md) |
| `scoresphere_live_matches_scorer_quiet` | stays high for 30 minutes | [Sync backlog](sync-backlog.md) |
| `scoresphere_sse_connections` | near the instance's connection limit | scale the API out (SSE needs no sticky sessions) |
| API health `GET /api/v1/health/ready` | fails | check Postgres, then the API logs |
