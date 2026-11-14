# Deploy

The stack is `infra/docker-compose.prod.yml`: Postgres, a one-off `migrate` job, the API
and the web app (nginx). The web app proxies `/api`, so the app and API share an origin and
the refresh cookie stays first-party. Put a TLS-terminating load balancer in front of `web`.

## First time

1. Copy `infra/.env.example` to `infra/.env` and fill it in. `JWT_SECRET` must be at least 32
   random characters (`openssl rand -base64 48`). The API refuses to start in production
   without `CORS_ORIGINS`, rate limits, and an `https` `PUBLIC_APP_URL`.
2. `docker compose -f infra/docker-compose.prod.yml up -d --build`
3. Check `GET https://<host>/api/v1/health/ready` returns `ok`.
4. Schedule [backups](backup-restore.md) and the metrics scrape ([alerts](README.md#alerts)).

## Every release

1. Review the release's migrations in `apps/api/drizzle/`. Never edit a migration that has
   been applied; add a new one.
2. Take a backup.
3. Build and start: `docker compose -f infra/docker-compose.prod.yml up -d --build`. The
   `migrate` job runs `node dist/migrate.js` before the new API starts.
4. Watch `/health/ready`, the error reports and `scoresphere_event_rejections_total` for
   15 minutes.
5. If the release raises `MIN_CLIENT_VERSION`, older apps keep scoring their current matches
   but can't start new ones until they update (ADR 0019).

## Rolling back

- **API only (no migration):** redeploy the previous image tag.
- **With a migration:** migrations are forward-only. Write and ship a fixing migration; only
  restore a backup if data was damaged ([restore](backup-restore.md)).
