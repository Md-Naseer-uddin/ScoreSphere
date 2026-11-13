# ScoreSphere

Mobile-first, offline-capable scoring for 12 sports: Cricket, Badminton, Tennis, Chess, Kabaddi, Volleyball, Basketball, Wrestling, Football, Kho-Kho, Field Hockey and Carrom. It serves individuals and organizations (schools, colleges, clubs, academies) and ships as a web PWA and a sideloaded Android APK.

- **Build plan and decisions:** [plan.md](plan.md)
- **Architecture decision records:** [docs/adr/](docs/adr/)
- **Original specification pack:** [docs/spec/](docs/spec/)
- **Progress:** [docs/progress.md](docs/progress.md)

## Development

**Prerequisites:** Node 24 (`nvm use` reads `.nvmrc`), pnpm via corepack, and Docker.

```sh
corepack enable pnpm
pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres on localhost:55432
cp apps/api/.env.example apps/api/.env
pnpm dev                                           # API on :3300, web app on :5173
```

| Service | URL |
|---|---|
| Web app (dev) | http://localhost:5173 |
| API | http://localhost:3300/api/v1 |
| API docs (non-production) | http://localhost:3300/api/docs |
| Postgres | `postgres://scoresphere:scoresphere@localhost:55432/scoresphere` |

**Checks** (CI runs all of them): `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

### Android APK

CI builds a debug APK on every push to `main`. To get it, open the repo's **Actions** tab, pick the latest **CI** run and download the `scoresphere-debug-apk` artifact. You don't need the Android SDK locally (ADR 0027).

### Repository layout

See [CLAUDE.md](CLAUDE.md#repository-layout).
