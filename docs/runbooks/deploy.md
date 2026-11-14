# Deploy

## Render (current)

[render.yaml](../../render.yaml) is a Blueprint for the **free demo**, in Singapore (Render has
no India region):

- one web service built from `infra/docker/demo.Dockerfile`. It runs nginx and the API together,
  because Render's free services can't receive private-network traffic;
- a free Postgres that only Render's private network can reach.

Free limits make it a demo, not a home for pilot users:

- It sleeps after 15 idle minutes and takes about a minute to wake.
- Profile photos are lost whenever it sleeps or redeploys (free services have no disk).
- The database has no backups and expires 30 days after it is created. Upgrade it before then
  to keep the data.

### First time

1. Dashboard → **New → Blueprint** → this repo. Enter `SUPPORT_EMAIL` when asked, then
   **Apply**.
2. When the deploy is live, `GET https://scoresphere-web.onrender.com/api/v1/health/ready`
   returns `ok`. If Render gave the service a different URL, change `PUBLIC_APP_URL` and
   `CORS_ORIGINS` in `render.yaml`.
3. Set the GitHub repository variables `SCORESPHERE_API_URL` (`https://<web>/api/v1`) and
   `SCORESPHERE_PUBLIC_APP_URL` (`https://<web>`), so CI's debug APK uses this server.

Pushes to `main` redeploy once CI passes. From a terminal: `render deploys list <service>`,
`render logs --resources <service>`.

### Before pilot users

- **Simplest:** in `render.yaml`, move the service and the database to paid plans. Add a disk to
  the service mounted at `/var/data`, with `STORAGE_DIR=/var/data/media`.
- **To scale later:** split it as below, with the API as a private service:
  - pre-deploy `node dist/migrate.js`;
  - its disk;
  - `PORT=3300`.

  Then `web.Dockerfile`, with `PORT=8080`, `API_HOSTPORT` from the API's `hostport` and health
  check `/`.

## Docker Compose

The stack is `infra/docker-compose.prod.yml`: Postgres, a one-off `migrate` job, the API
and the web app (nginx). The web app proxies `/api`, so the app and API share an origin and
the refresh cookie stays first-party. Put a TLS-terminating load balancer in front of `web`.

## First time

1. Copy `infra/.env.example` to `infra/.env` and fill it in. `JWT_SECRET` must be at least 32
   random characters (`openssl rand -base64 48`). The API refuses to start in production
   without `CORS_ORIGINS`, rate limits, and an `https` `PUBLIC_APP_URL`. Include
   `https://localhost` in `CORS_ORIGINS`: that is the Android app's origin, and it calls the API
   from there.
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
