# ScoreSphere — instructions for Claude

Mobile-first, offline-capable scoring platform for 12 sports. It ships as a React PWA, a Capacitor Android APK and a NestJS API on PostgreSQL.

## Sources of truth (in priority order)

1. [plan.md](plan.md): build plan, decisions D1–D25, milestones, definition of done.
2. [docs/adr/](docs/adr/): one record per decision, including owner decisions 0026–0027.
3. [docs/spec/](docs/spec/): the original spec pack. Use it for detail; where it conflicts with 1 or 2, those win.

Read [docs/progress.md](docs/progress.md) first. It says which milestone is in progress and what comes next. Update it whenever a checklist item is finished.

## Decisions that must not be lost

- **12 sports**, each with its own engine. Never a generic `if/else` engine.
- **Login is a unique 10-digit Indian mobile number + password.** It is stored as E.164. There is **no OTP/SMS** for now (ADR 0025). Recovery uses a one-time recovery code or an optional verified email.
- **Accounts are 18+ only** (ADR 0026). Minors take part only as organization-managed roster members.
- **Three participant kinds** (ADR 0011):
  - Player: phone → global `person`;
  - Roster member: name only, workspace-private, server-synced;
  - Quick guest: device-local.
- **Phone lookup returns only `DISCOVERABLE | INVITE`** (ADR 0012). A claim needs the user's confirmation plus workspace-admin approval (ADR 0013, 0025).
- **Scoring is local-first.** Every event commits to Dexie, then syncs through a single `POST /matches/:id/events` (ADR 0004).
- **Undo/correction = ledger `VOID`/`REPLACE` + replay** (ADR 0005). Lifecycle, roster and clock changes are events too (ADR 0006).
- **One scorer per match,** fenced by `lease_epoch` (ADR 0007). Events are accept-and-flag, never drop-on-disagreement (ADR 0009).
- **Realtime is SSE + Postgres `LISTEN/NOTIFY`** (ADR 0002). Share tokens live in the URL fragment (ADR 0021).
- **Sports metadata, presets, award definitions and rules help content are code** in `packages/sports` (ADR 0015).
- **Drizzle is the ORM** (ADR 0001). IDs are UUIDv7 (ADR 0022). No personal data in events or logs (ADR 0024).

## Repository layout

```text
apps/client      React PWA + Capacitor android/
apps/api         NestJS modular monolith (REST + SSE), Drizzle schema + migrations
packages/contracts   Zod schemas: API DTOs, event envelope, sync protocol, error codes
packages/engine-kit  engine contract, ledger fold, rules evaluator, timer helpers
packages/sports      src/<sport-key>/: engine, settings, presets, stats, awards, content, golden logs
packages/config      shared tsconfig / eslint
infra/               docker-compose, Dockerfiles
```

Dependency rule: `sports → engine-kit → contracts`. Packages never import apps, DB clients, DOM APIs or Node-only APIs.

## Commands

Run from the repo root. pnpm comes via corepack (`corepack pnpm …`, or `pnpm` once corepack is enabled).

| Task | Command |
|---|---|
| Install | `corepack pnpm install` |
| Local services (Postgres, MinIO) | `docker compose -f infra/docker-compose.yml up -d` |
| Dev (all apps) | `corepack pnpm dev` |
| Lint / typecheck / test / build | `corepack pnpm lint` · `typecheck` · `test` · `build` |
| One package | `corepack pnpm --filter @scoresphere/<name> <script>` |

## Working method

- Work in small vertical slices, in this order: schema/migration → domain → contract → API → UI → tests → docs.
- Engines are written test-first against golden logs (event log → expected scorecard/result), plus property tests.
- Every workspace-owned query goes through the workspace-scoped repository. Every endpoint gets authorization-matrix tests.
- Never claim something is done unless the code, tests and the end-to-end flow exist. Definition of done: [plan.md §4](plan.md).
- If a scoring rule or award criterion is ambiguous, make it configurable or ask. Never silently invent scoring semantics.

## Git

- Remote: `git@github-personal:Md-Naseer-uddin/ScoreSphere.git`.
- Author (repo-local config): `Md-Naseer-uddin <152385535+Md-Naseer-uddin@users.noreply.github.com>`.
- Commit small logical changes with brief messages. **No `Co-Authored-By` or other attribution trailers.**
- Push straight to `main` once lint, typecheck and tests pass.
