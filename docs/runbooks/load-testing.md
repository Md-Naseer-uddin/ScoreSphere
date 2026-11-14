# Load testing

Checks that the API can take events from many scorers at once and fan them out to spectators (plan M11). Run it before a release that touches ingestion, the ledger or live streams, and before a large event.

## Running it

1. Start an API whose rate limits are off, against a scratch database. **Never point this at production.**

   ```sh
   cd apps/api
   PORT=3311 RATE_LIMIT_ENABLED=false NODE_ENV=test \
     DATABASE_URL=postgres://…/scratch JWT_SECRET=… node dist/main.js
   ```

2. Run the script:

   ```sh
   node infra/load/load-test.mjs --base http://localhost:3311 --matches 50 --events 100 --spectators 200
   ```

   It registers one account and scores `--matches` badminton matches at once, one rally per request, as a phone does. `--spectators` follow the first match on the public live stream.
3. Read the output:
   - **ingest latency:** time for each `POST /matches/:id/events`;
   - **throughput:** events accepted per second;
   - **spectator delivery:** time from posting an event to a spectator receiving it.

   Every update should arrive, and there should be no errors.
4. Stop the API by its process ID, and drop the scratch database.

## Results

One API instance and Postgres 18 on a developer laptop (Apple silicon), 14 November 2026:

| Scorers at once | Spectators | Events | Ingest p50 / p95 / p99 | Throughput | Delivery p50 / p95 | Delivered |
|---|---|---|---|---|---|---|
| 20 | 50 | 2,000 | 33 / 47 / 55 ms | 571 events/s | 56 / 76 ms | 5,000 of 5,000 |
| 50 | 200 | 5,000 | 98 / 123 / 139 ms | 496 events/s | 177 / 216 ms | 20,000 of 20,000 |

**What this means:**
- A scorer sends at most one event every few seconds, so one instance can carry several hundred matches at once with room to spare.
- Latency grows with concurrency, because every event is checked and committed in its own transaction (ADR 0004).
- Above this load, add API instances behind the load balancer. `LISTEN/NOTIFY` fans updates out to every instance (ADR 0002).

## What it doesn't cover

- **Real phones on mobile networks.** Watch `scoresphere_live_matches_scorer_quiet` and the [sync backlog runbook](sync-backlog.md) in production instead.
- **Many spectators on many matches.** Each SSE connection is cheap, but run the script against a staging copy of the production setup before a large event.
