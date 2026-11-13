# ScoreSphere — Implementation Plan

**Status:** Build plan v1.1 · 2026-11-14
**Baseline:** `docs/spec/` (spec pack v1.1, originally `multi-sport-scoring-spec/`)
**Authority:** This file supersedes `docs/spec/plan.md`. Where it deviates from the other spec documents, §2.2 records the reason; the spec is amended to match in M0.

## 1. Context

ScoreSphere is a mobile-first, offline-capable scoring platform for 12 sports (Cricket, Badminton, Tennis, Chess, Kabaddi, Volleyball, Basketball, Wrestling, Football, Kho-Kho, Field Hockey, Carrom) for individuals and organizations (schools, colleges, clubs, academies) in India. It ships as a web PWA and a sideloaded Android APK. The scope covers phone-number identity, teams and players, configurable rules, an immutable scoring ledger, tournaments, awards and read-only live sharing.

The spec pack is detailed and mostly sound. Before planning, every decision in it was re-examined on its reasoning, including an independent adversarial review. The review found:
- **Data-model contradictions.** The player identity rules, guests, presets and tournament fixtures cannot support stated requirements as written.
- **An inverted build order.** Offline sync and live sharing come last, even though the spec calls offline "core". The rules builder comes before any engine exists.
- **Simpler or better-fitting technology** for realtime, client storage, ORM and undo.

This plan keeps the spec's principles and fixes those issues. It is organized as vertical-slice milestones with a pilot release before v1.0.

**Owner decisions made during this review (2026-11-13):**
1. Non-account participants: keep device-local **Quick guests** and add workspace-synced **Roster members** (§2.2 D11).
2. Release strategy: **pilot first** (platform + 5 sports), then **v1.0** with all 12 sports, tournaments and awards.
3. ORM: **Drizzle** instead of Prisma.
4. Phone numbers: **no verification for now**. Any valid, unique 10-digit Indian mobile number is accepted (2026-11-14, §2.2 D25).
5. Minors: **18+ accounts only** for the pilot. Registration asks users to confirm they're 18+; under-18 participants appear only as organization-managed roster members (2026-11-14).
6. Android APK: **built in GitHub Actions** and downloaded from the CI run for sideloading; no local Android SDK needed (2026-11-14).

## 2. Decision review

### 2.1 Kept — scrutinized and sound

| Decision | Why it holds |
|---|---|
| TypeScript pnpm monorepo + Turborepo | Pure engine code is shared by client and server, which is what keeps offline and online scoring identical. |
| Modular NestJS monolith, no microservices | Ledger, projection and authorization share one transaction boundary. |
| PostgreSQL | Relational ownership and constraints, plus `jsonb` for engine state and config. |
| React + Vite SPA, Tailwind, TanStack Query, Zustand (no Redux, no SSR) | SSR adds nothing to an offline SPA wrapped by Capacitor. |
| Capacitor rather than a TWA wrapper | Provides Keystore secure storage, keep-awake while scoring, haptics, live bundle updates and file export. |
| Append-only event ledger + projection; client-generated event IDs as idempotency keys | Gives undo, audit and replay. Retries can never double-score. |
| One active scorer device per match | Automatically merging two timelines is the wrong model for live sport. |
| Engine version and ruleset pinned per match | Historical results never change silently. |
| Phone number (E.164 `varchar`) as the unique login ID; password login | The identifier Indian users expect; password login means no SMS cost or SMS dependency per login. Verification is deferred (D25). |
| `discoverable_by_phone` off by default | Privacy by default. |
| REST for writes; hashed, revocable, optionally expiring share tokens | Durable, idempotent commands. |
| Awards record provenance (auto / manual / override), criteria version and metric snapshot | Results are explainable and auditable. |
| Tournament MVP formats: round-robin and single elimination | Covers most local events. |
| Rules are data, never executable user code | Safety and determinism. |

### 2.2 Changed — with reasons

Each change has an ID. An ADR is written for each in `docs/adr/` during M0.

**D1 — ORM: Prisma → Drizzle ORM + drizzle-kit SQL migrations.** *(owner-confirmed)*
- The schema depends on CHECK constraints (exactly one recipient, target or entry), partial unique indexes (active memberships), typed `jsonb` (engine state and configs) and aggregate SQL (standings, leaderboards).
- All of these are native in Drizzle. Prisma needs hand-edited migration SQL and types `jsonb` loosely.

**D2 — Realtime: Socket.IO + outbox + Redis adapter → Server-Sent Events (SSE) + Postgres `LISTEN/NOTIFY`.**
- The spec already sends every write over REST, so realtime is strictly server→client.
- SSE reconnects natively with `Last-Event-ID`. Setting that to the match version gives exactly the catch-up semantics needed.
- SSE is plain HTTP (no sticky sessions), and NestJS supports it with `@Sse()`.
- `pg_notify` issued inside the write transaction is delivered **only on commit**. That gives "broadcast after commit" without an outbox table and fans out across API instances without Redis.
- A missed notification self-heals: the client sees a version gap and catches up.
- Cost: `LISTEN` needs one dedicated, non-pooled connection per instance. Add WebSockets only if bidirectional realtime (multi-scorer) is ever built. An outbox returns only if notifications are added.

**D3 — Client storage: IndexedDB (web) + SQLite (Android) → Dexie/IndexedDB on both.**
- Two engines mean two schemas, two migration paths and two transaction semantics, all for the most safety-critical code.
- On Capacitor Android, WebView IndexedDB lives in app-private storage and isn't evicted. The usual reason for SQLite is iOS WKWebView, which is not a target.
- Keep a thin `LocalStore` interface so native SQLite can be added if measurement ever demands it.
- Hard rule: never change Capacitor's scheme or hostname after release. Changing the origin wipes local data.

**D4 — One write path.**
- The spec has separate `/actions`, `/corrections` and `/sync/.../events` endpoints, separate online and offline flows, and lifecycle endpoints.
- Instead, the client is always local-first:
  - every action commits to the local DB and the sync queue;
  - a single `POST /matches/:id/events` takes a batch of one or more events;
  - online simply means the queue drains immediately.
- Offline is the only code path, so nothing has to be retrofitted later.

**D5 — Undo and correction: per-engine compensating logic → ledger-level `VOID(seq)` and `REPLACE(seq, command)`.**
- State is a fold over the non-voided events.
- After a mid-match correction, all later events are re-validated. If any become invalid, the correction is rejected with an explanation, and the scorer undoes back to that point instead.
- Engines implement forward `apply` only.
- Why: writing inverse logic for 12 engines, plus reversing rule side-effects, is a large bug surface. Replaying a few thousand events takes milliseconds.

**D6 — Lifecycle, roster changes and clocks become ledger events.**
- The spec has `/start|pause|resume|finish|cancel` endpoints that mutate `matches.status`, a separate `match_timer_states` table, and server timestamps as clock authority.
- Under that design, an offline pause or finish can't sync, replay can't rebuild clocks, and server timestamps mean nothing for events that arrive hours late.
- Instead, these are all ledger events: start/pause/finish, playing XI, substitutions and clock transitions.
- Timers are derived in the projection. The scoring device owns elapsed time (monotonic clock), and the server accepts the lease holder's timings.
- `matches.status` becomes a projection column used only for queries.

**D7 — Scorer lease: time-based lease with an offline grace period → lease with no time expiry, plus a monotonically increasing `lease_epoch` (fencing token) on every event.**
- Handover happens explicitly, or by an admin force-takeover, which bumps the epoch.
- Events from a superseded epoch are rejected but preserved for review and export.
- Why: a long match with no signal would outlive any grace period. A dead battery mid-match is an MVP case, not a future one.

**D8 — Offline match creation gets a mechanism.**
- Match IDs are client-generated UUIDv7.
- `MATCH_CREATED` (config + roster snapshot) is event 0, and the creating device holds epoch 1.
- The server materializes the match on first sync.
- Server-originated matches (tournament fixtures) are claimed by a scorer device, which then downloads their config.

**D9 — Server validation policy: accept and flag instead of drop.**
- An event can pass auth, schema, epoch and engine-version checks but still fail server engine validation.
- Such an event is stored, the match is flagged `NEEDS_REVIEW` (alert raised, awards blocked) and the event is not dropped.
- Why: those events are what happened on the field. A disagreement is a bug signal, not grounds to lose the match.

**D10 — Player identity: global `persons` + workspace-scoped `roster_members`.**
- In the spec, `players` is workspace-scoped, but `phone_identity_id` and `linked_user_id` are globally UNIQUE.
- So a person can exist in only one workspace: a second club can't add them, and cross-team history is impossible.
- Fix: `persons` is global (one per phone identity, optionally linked to a user). `roster_members` is per workspace (alias, jersey, optional `person_id`), with uniqueness on `(workspace_id, person_id)`.

**D11 — Three participant kinds.** *(owner-confirmed)*

| Kind | Identity | Stored | Searchable | Tournament stats / awards |
|---|---|---|---|---|
| **Player** | phone → `person` | server | exact-phone lookup only, per privacy | yes |
| **Roster member** | name / jersey only, no phone | server, private to the workspace | never | yes; can later be linked to a person by invite + consent |
| **Quick guest** | device-local | device; minimal snapshot per match | never | match scorecard only; can be promoted to roster member |

- Why: organization co-scorers need shared rosters, tournament stats need a stable ID, and most school students have no accounts.
- UX: the primary choices are Player and Roster member. Quick guest is offered in the quick-match flow.

**D12 — Phone lookup no longer distinguishes non-discoverable accounts from no account.**
- The lookup returns only `DISCOVERABLE` (profile card) or `INVITE`.
- Behind `INVITE`, the server either creates a pending person or sends an association request to the existing account.
- Why: the spec's four-state response tells any authenticated user which numbers are registered, which defeats `discoverable_by_phone=false`.

**D13 — Account claim requires explicit confirmation.**
- At registration the user sees "N teams added you as <name>" and confirms or declines each.
- Why: recycled numbers (common in India) and typos would otherwise hand a stranger's history to a new user.
- While phone verification is off, a claim also needs approval from a workspace admin (D25).

**D14 — Deferred with OTP (D25).** When OTP is added, key challenges by a phone HMAC, not a FK to `phone_identities`.
- Identity rows are then created only on verification or an explicit invite.
- Why: otherwise anonymous OTP requests create identity rows for arbitrary numbers.

**D15 — Sports catalogue, formats, presets, award definitions and rules help content live in code, not DB seed tables.**
- They sit in per-sport package folders and are bundled into the client, so they work offline, are versioned in git, reviewable and translatable.
- The DB keeps only:
  - `sport_key`;
  - user-created rulesets;
  - records that reference `criteria_version`.
- A match references either `preset_key@version` or `ruleset_version_id`, and stores the resolved config. This fixes the spec's FK, which made official presets unusable at match start.
- Why: behaviour is code anyway, and a DB `calculation_config jsonb` with no versioned code behind it is an unaudited way to change award outcomes.

**D16 — Rules engine in two layers, sequenced after the engines exist.**
- **(a) Typed settings schema per sport (Zod), built with each engine.** It covers most real local variants: overs, six-and-out, last-man-stands, one-tip-one-hand, wide-penalty thresholds, golden point, and so on.
- **(b) Trigger-condition-action (TCA) rules.** Their actions are limited to commands the engine declares (e.g. `cricket.awardPenaltyRuns`). They run back through `engine.apply` and are recorded as derived events carrying the rule ID and version.
- The builder ships after the pilot. Each later sport adds its rule catalogue as part of its definition of done.
- Why: the spec's actions write allow-listed state paths. That bypasses engine invariants, and statistics built from events would never see rule effects. Trigger and action catalogues come from the engines, so they can't be built before them.

**D17 — Package layout by sport, not by layer.**
- The spec's `contracts / scoring-core / rules-core / sport-definitions / sync-protocol` become:
  - `contracts` (Zod: API DTOs, sync envelope, error codes);
  - `engine-kit`;
  - `sports` (one folder per sport);
  - `config`.
- Adding a sport means adding one folder. Zod contracts are validated at runtime on both sides and generate OpenAPI, with no duplicated class-validator DTOs.

**D18 — Build order re-sequenced (§5).** The spec's order and its problems:
- Offline sync (step 16) and live sharing (15) came last.
- The rules builder (4) came before any engine (7).
- Stats and awards (14), rate limits (18) and Capacitor (17) all came late.

New order:
- A walking skeleton on Badminton proves the full pipeline before Cricket.
- Stats and award metrics are part of every sport's definition of done.
- Rate limiting on registration and login ships with auth in M1.
- The Capacitor shell exists from M0.

**D19 — Engine version drift is managed explicitly.**
- Engine modules are frozen and versioned (`cricket@1`, `cricket@2`), and the server ships all of them.
- A device scores a match only if it has the match's pinned version.
- A minimum-client-version gate applies to new matches, and bundles are never swapped mid-match.
- CI runs the same golden logs against both client and server builds.
- A self-hosted Capacitor live-update channel delivers web-bundle fixes, because sideloaded APKs don't auto-update.

**D20 — Session transport (the spec left it open).**
- Access token: JWT, about 15 minutes, held in memory only.
- Refresh token: opaque, rotating, with reuse detection.
  - **Web:** httpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1/auth/refresh` on a same-site API subdomain.
  - **Capacitor:** stored in Keystore-backed secure storage and sent in the request body. API cookies from `https://localhost` are third-party in the WebView.
- Offline scoring needs no server auth. A device may score offline for a configurable window since its last successful refresh.

**D21 — Share links move to the URL fragment.**
- `/live/:token` becomes `/live#<token>`. The fragment never appears in requests, `Referer` headers or server logs.
- The client sends the token in a header, and responses set `Referrer-Policy: no-referrer`.
- Public endpoints are rate-limited, with an optional broadcast delay, because ball-by-ball feeds of local cricket get scraped for betting.

**D22 — IDs are UUIDv7 everywhere.** They can be generated on the client (needed for offline creation) and are time-ordered for index locality.

**D23 — Tournament and award schema fixes.**
- Fixtures get nullable `side1_entry_id` and `side2_entry_id`, a nullable `match_id`, and bye support. The spec's `match_id UNIQUE NOT NULL` can't represent later knockout rounds whose sides aren't known yet.
- `award_records` gets `status` (CANDIDATE / PUBLISHED / STALE / SUPERSEDED), with uniqueness applied to published records only. This is what the spec's stale→republish workflow needs.
- v1 tournaments are single-workspace; cross-workspace (inter-school) entries come later.

**D24 — Event payloads are free of personal data.**
- Events reference `participant_id` (`match_side_participants.id`), never phone numbers or names.
- Anonymizing a person means updating snapshot rows, while events stay immutable.

**D25 — Phone numbers are not verified for now.** *(owner decision, 2026-11-14)*
- Registration accepts any valid 10-digit Indian mobile number (starts with 6–9, checked with libphonenumber-js). It is stored as E.164 (`+91…`) and must be unique.
- There is no OTP, no SMS provider and no DLT registration.
- Without verification nobody can prove they own a number. The plan covers the gaps this opens:
  - **Password recovery.** A one-time recovery code is shown at registration for the user to save. An optional email address with a verified reset link is a second route. Otherwise, reset is done by support.
  - **Number squatting.** Someone can register a number that isn't theirs and lock the real owner out. Registration is rate-limited per IP and device, and a "this is my number" report goes to support.
  - **Profile claims.** Whoever registers a number could claim the pending player added under it. A claim therefore needs the user's confirmation (D13) **and** approval from an admin of each workspace that added that player. Admins can unlink a claim.
  - **Phone change** needs the current password, must keep the number unique, and is audited.
  - **Invites** go out as a link through the native share sheet (WhatsApp and similar), not SMS.
- Verification can be added later without migrating existing data:
  - `phone_identities.verified_at` stays null for now;
  - an `OtpProvider` interface is reserved;
  - D14 describes the challenge table.
  - Once verification ships, a verified owner wins: any unverified account holding that number is asked to change it.

**Minor consistency fix:** the sport key is `field-hockey`, displayed as "Hockey" (the spec mixes the two).

## 3. Target architecture

### 3.1 Stack

Use the latest stable versions at scaffold time, pinned in the lockfile.

| Layer | Choice |
|---|---|
| Tooling | Node 24 LTS, pnpm workspaces, Turborepo, TypeScript strict, ESLint + Prettier, Vitest |
| Client | React 19, Vite, Tailwind CSS v4, shadcn/ui (Radix), React Router, TanStack Query, Zustand, React Hook Form + Zod, Dexie, vite-plugin-pwa (Workbox), i18next (English first, Hindi-ready) |
| Android | Capacitor with plugins for secure storage (Keystore), keep-awake, haptics, status bar, splash, share and self-hosted live update |
| API | NestJS 11, nestjs-zod (DTOs + OpenAPI from shared Zod), @nestjs/throttler, pino with PII redaction, OpenTelemetry |
| Data | PostgreSQL 17+ (managed, India region), Drizzle ORM + drizzle-kit, `LISTEN/NOTIFY` |
| Media | S3-compatible object storage (MinIO locally), sharp re-encoding |
| Auth | argon2id; JWT access + opaque refresh; libphonenumber-js validation; one-time recovery codes; transactional email for optional reset links (no SMS provider until verification is added, D25) |
| Testing | Vitest, fast-check (property tests), Testcontainers (Postgres), Playwright, k6 |
| Errors | Error tracker with PII scrubbing (e.g. Sentry) |

### 3.2 Repository layout

```text
ScoreSphere/
├── apps/
│   ├── client/        React PWA; Capacitor android/ project lives here
│   └── api/           NestJS modular monolith (REST + SSE); Drizzle schema + migrations
├── packages/
│   ├── contracts/     Zod: API DTOs, event envelope, sync protocol, error codes
│   ├── engine-kit/    engine contract, ledger fold (VOID/REPLACE/lifecycle), rules evaluator,
│   │                  timer math, set/period/rally helpers
│   ├── sports/        src/<sport-key>/: settings schema, presets, engine, stats, awards,
│   │                  rule catalogue, rules help content, golden logs + tests
│   └── config/        shared tsconfig / eslint
├── infra/             docker-compose (postgres, minio), Dockerfiles, deploy config
├── docs/
│   ├── spec/          ← moved from multi-sport-scoring-spec/ in M0
│   └── adr/           one ADR per D-decision
├── plan.md
├── CLAUDE.md          derived from the spec's CLAUDE.md + this plan's deviations
├── pnpm-workspace.yaml
└── turbo.json
```

Dependency rule, enforced by lint:
- `sports` → `engine-kit` → `contracts`.
- Packages never import apps, DB clients, DOM or Node-only APIs.

### 3.3 Engine contract

```ts
interface SportEngine<State, Config, Command> {
  key: SportKey; version: number;
  settingsSchema: ZodType<Config>;
  presets: Preset<Config>[];
  init(config: Config, roster: MatchRoster): State;
  commands(state: State): CommandDescriptor[];   // drives the sport-specific scoring UI
  validate(state: State, cmd: Command): Result<void, EngineError>;
  apply(state: State, cmd: Command, ctx: ApplyCtx): { state: State; facts: DomainFact[] }; // pure
  isComplete(state: State): boolean;
  result(state: State): MatchResult;
  stats(state: State): MetricRecord[];           // feeds statistics and awards
  ruleCatalogue: { triggers: TriggerDef[]; commands: RuleCommandDef[] };
}
```

**engine-kit owns:**
- ordering by server sequence;
- VOID / REPLACE;
- lifecycle, roster and clock events;
- rule evaluation (priority, depth and cycle limits, derived events);
- replay.

Engines never see undo. Each sport is its own engine; there is no generic `if/else` engine. Families share helpers only: rally/set (Badminton, Volleyball, Tennis), timed-period (Football, Hockey, Basketball) and raid/chase (Kabaddi, Kho-Kho).

### 3.4 Scoring write path (online and offline are identical)

1. **Tap.** The client builds a command with an `eventId` (UUIDv7), `localSeq`, `leaseEpoch`, `expectedVersion` and `engineVersion`.
2. **Local apply.** engine-kit validates and applies it locally, including rules.
3. **Local commit.** One Dexie transaction appends the event, updates the local projection and enqueues it for sync. The UI renders only after commit and shows "Saved on device".
4. **Push.** The sync worker sends the batch to `POST /matches/:id/events`.
5. **Server validation.** The API checks, in order:
   - auth;
   - workspace role and lease epoch;
   - idempotency (unique `(match_id, event_id)`);
   - engine version;
   - engine validation by replay.
6. **Server commit.** One transaction inserts the events, updates `matches.current_state`, `version` and `status`, and issues `pg_notify('match_updates', {matchId, version})`.
7. **Response.** Each event comes back as `ACCEPTED`, `ALREADY_PROCESSED`, `REJECTED(reason)` or `CONFLICT(epoch)`, with the server sequence and new version. The client marks acknowledged events and shows "Synced".
8. **Broadcast.** Each API instance `LISTEN`s and pushes the update to its SSE subscribers. A reconnecting client sends `Last-Event-ID`; the server replies with the missing events or a snapshot. Spectators of an offline match see the last synced state with a "stale" badge.

### 3.5 Schema delta vs `database-schema.md`

- **Identity**
  - `phone_identities` holds registered or invited numbers; `verified_at` stays null until verification ships (D25).
  - `users` gains `recovery_code_hash` (D25).
  - `otp_challenges` is deferred until verification (D14).
- **New: `persons`** — `id`, `phone_identity_id UNIQUE NULL`, `user_id UNIQUE NULL`, `status (PENDING_CLAIM | CLAIMED | ARCHIVED)`.
- **New: `roster_members`** — `workspace_id`, `person_id NULL`, `display_name`, `jersey_default`, `sport_roles`, `status`, with a partial unique index on `(workspace_id, person_id) WHERE person_id IS NOT NULL`.
- **New: `association_requests`** — consent flow for linking an existing account to a roster, or a roster member to a person.
- **`team_memberships`** — `roster_member_id` replaces `player_id`; partial unique index on active membership.
- **`matches`**
  - Added: `lease_device_id`, `lease_epoch`, `preset_key`, `preset_version`, `ruleset_version_id NULL`, `resolved_config jsonb`, `needs_review`.
  - CHECK: exactly one of preset or ruleset version.
  - `status` is derived from events.
- **`match_side_participants`**
  - `id` is generated on the client.
  - `roster_member_id NULL` (null means a quick guest).
  - Snapshot fields only.
- **`match_events`** (renamed)
  - Added: `lease_epoch`, `kind (COMMAND | VOID | REPLACE | LIFECYCLE | ROSTER | CLOCK | DERIVED)`, `target_seq NULL`, `rule_ref NULL`.
  - Unique on `(match_id, seq)` and `(match_id, event_id)`.
  - `match_event_rejections` keeps refused events for recovery.
- **Tournaments and awards**
  - `tournament_entries` holds a team or a roster member.
  - `tournament_fixtures` and `award_records` follow D23.
  - Award recipient: `participant_id` (match scope), or `roster_member_id` / `team_id`.
- **Dropped or deferred**
  - `sports`, `sport_formats`, `sport_rule_templates`, `sport_award_definitions` → code (D15).
  - `match_timer_states` → projection (D6).
  - `sync_receipts` → covered by unique `(match_id, event_id)` + `match_event_rejections`.
  - `outbox_events` → until notifications are added.
  - `match_state_snapshots` → deferred; `matches.current_state` is the cache, and snapshots are added only if profiling shows a need.

### 3.6 API delta vs `api-specification.md`

- **Scoring and lifecycle**
  - `POST /matches/:id/events` (batch) replaces `/actions`, `/corrections`, `/start`, `/pause`, `/resume`, `/finish`, `/cancel` and `POST /sync/matches/:id/events`.
  - `GET /matches/:id/events?after=<seq>` pulls the ledger.
  - `POST /matches/:id/lease` handles claim, handover and force-takeover.
- **Realtime**
  - `GET /matches/:id/stream` (SSE, authenticated) and `GET /public/live/stream` (SSE, share token in a header) replace the Socket.IO `/matches` namespace.
- **Offline reference data**
  - `GET /sync/reference?since=<cursor>` returns workspaces, teams, roster members and rulesets for the offline cache.
- **Phone lookup**
  - `POST /people/lookup` returns `DISCOVERABLE | INVITE` (D12).
- **Removed**
  - Rules-content and preset endpoints; that content is bundled with the client (D15).

## 4. Engineering conventions

- **Contract-first.** Each Zod schema in `contracts` generates the Nest DTO, the OpenAPI spec and the client types.
- **Workspace scoping.** Every workspace-owned query goes through a scoped repository that requires a `WorkspaceContext`. An authorization-matrix test runs for every endpoint × role × foreign workspace.
- **Engines are test-first,** built against **golden logs**: real scoresheets transcribed into event logs, each with an expected scorecard and result.
- **Migrations** run only through drizzle-kit, and the generated SQL is reviewed. Never change a production schema ad hoc.
- **No personal data in logs or event payloads.** A log-scan test fails the build if phone, password, recovery-code or token patterns appear in e2e logs.
- **Small reviewable slices,** each in the order: schema → domain → API contract → UI → tests → docs.

**Sport definition of done.** A sport is labelled "supported" only when all of these exist:
- settings schema + official and casual presets;
- engine covering all commands;
- scoring UI built from `commands()`;
- undo and correction via the ledger;
- timers where applicable;
- result and scorecard;
- stats metrics + match award definitions with tie-breaks;
- rules help content citing the source edition;
- rule catalogue (from M8 on);
- golden logs + property tests passing on both the client and server builds;
- an offline e2e smoke test;
- the spectator view.

## 5. Milestones

Milestones are vertical slices. After M3, an engine track (sports) and a platform track (tournaments, rules builder, hardening) can run in parallel.

### M0 — Foundations
- `git init`; scaffold the monorepo (§3.2); move the spec to `docs/spec/`; write the root `CLAUDE.md`; write ADRs D1–D25; amend conflicting spec sections.
- docker-compose with Postgres and MinIO. CI runs typecheck, lint, test and build per package, and builds a debug APK.
- **API skeleton:**
  - Zod config validation;
  - pino with redaction;
  - error envelope and request IDs;
  - health and readiness checks;
  - OpenAPI;
  - Drizzle setup.
- **Client skeleton:**
  - Tailwind and shadcn/ui;
  - router and query client;
  - error boundary;
  - i18n;
  - Dexie bootstrap;
  - PWA manifest and app-shell service worker.
- **Capacitor Android shell on a real low-end device.** Verify:
  - IndexedDB persists across kill and restart;
  - secure storage works;
  - keep-awake works.
- **Start external lead-time items now:**
  - Android developer verification;
  - APK signing keystore custody.

**Exit:** `pnpm build/lint/test` green in CI; the CI-built APK installs and launches; the API health check is reachable on staging.

### M1 — Identity and workspaces
- **Auth (no phone verification, D25):**
  - phone validation (valid Indian mobile number, unique);
  - rate limits with backoff on registration and login, per IP, device and phone;
  - register, login, refresh rotation, logout, password change, phone change (needs current password);
  - one-time recovery code at registration; reset via recovery code or optional verified email;
  - devices and sessions;
  - personal workspace created at registration.
- **Profile:** profile fields; avatar via signed upload with server-side signature check, re-encode and metadata strip.
- **Organizations:** memberships, roles (OWNER / ADMIN / SCORER / VIEWER), invitations, audit log for role changes.
- **Client:** auth screens, profile, workspace switcher, organization screens, core design-system components, bottom navigation.

**Exit:**
- e2e: register → login → create organization → invite member → member accepts.
- e2e: forgot password → reset with recovery code → old sessions revoked.
- Duplicate phone registration is rejected.
- The authorization matrix proves cross-workspace isolation.
- The log-scan test passes.

### M2 — People and rosters
- `persons`, `roster_members`, teams, team memberships.
- `/people/lookup` (D12); pending persons; association requests; claim confirmation at registration plus workspace-admin approval (D13, D25); share-link invites; linking a roster member to a person.
- Quick guests in Dexie, with promote-to-roster.
- Reference-data sync to Dexie (initial download + `since` cursor).

**Exit:**
- e2e: add a pending player → they register → they confirm the claim → a workspace admin approves → the same person is on the roster, with no duplicate persons.
- A test proves lookup responses are indistinguishable for non-discoverable accounts and for no account.
- Roster members are visible to a second organization scorer on another device.

### M3 — Walking skeleton: Badminton end-to-end, offline-first
- **engine-kit:** contract, ledger fold, VOID/REPLACE, lifecycle, roster and clock events, replay. **contracts:** event envelope and sync protocol.
- **Badminton engine:** singles and doubles, rally scoring, deuce and cap, service court and rotation. Plus settings, presets, stats, Player of the Match and rules content.
- **Match flow:**
  - generic match wizard with sport-specific options, including quick matches without a saved team;
  - scoring screen driven by `commands()`;
  - event timeline;
  - undo and correction;
  - summary and scorecard;
  - history list.
- **Write path and lease:**
  - the local-first write path (§3.4), sync worker and `POST /matches/:id/events`;
  - lease with epoch, handover and force-takeover;
  - offline match creation;
  - `NEEDS_REVIEW` flagging;
  - sync-status UI with all six states from `frontend-spec.md` §11.
- **Live sharing:** create, revoke and expire share links; `/live#token`; SSE fan-out via `LISTEN/NOTIFY`; `Last-Event-ID` catch-up; stale badge.

**Exit:**
- Playwright e2e:
  - score online → go offline mid-match → reload/kill → continue → reconnect → every event synced exactly once;
  - a spectator joins mid-match and catches up;
  - a revoked link stops working;
  - a force-takeover rejects the stale device's events but keeps them.
- The same scenario works on the Android device.
- Golden logs pass on both client and server builds.

### M4 — Cricket
- **Engine:**
  - deliveries, extras (wide, no-ball, bye, leg-bye), all dismissal types, run-outs at either end;
  - strike rotation, overs and innings, free hit, retired hurt/out;
  - super over when configured;
  - playing XI and substitutions as roster events.
- **Settings and presets:**
  - format presets: T20, ODI, T10, box, gully;
  - local variants as typed settings (six-and-out, last-man-stands, one-tip-one-hand, consecutive-wide penalty with explicit threshold semantics).
- **Scorecards:** batting, bowling, fall of wickets, extras.
- **Stats:** runs, balls, strike rate, 4s and 6s, wickets, overs, economy, maidens.
- **Match awards:** Player of the Match, Best Batter and Best Bowler, with tie-breaks the owner signs off.
- Fast ball-by-ball scoring UI.

**Exit:**
- At least 10 golden logs from real scoresheets (including a gully game) reproduce the scorecards exactly.
- Property tests pass.
- A field test with a real local match succeeds.

### M5 — Rally family + Chess (timer foundation)
- Tennis (point → game → set → match, advantage or no-ad, tie-break, final-set rules, service order) and Volleyball (sets, rotation, timeouts, substitutions), using shared rally/set helpers.
- Timer model in engine-kit:
  - clock events with device-owned elapsed time;
  - derived display;
  - spectators compute server time offset from the `serverNow` value in snapshots;
  - recovery after background, screen lock and process kill.
- Chess clock: base time, increment, delay, stages, flag fall, result by resignation, draw, agreement or time.

**Exit:**
- Tolerance is defined and met on Android: proposed ±1 s of displayed drift after background/kill recovery, with chess increments exact.
- Timer tests cover screen lock, app kill and offline.

### M6 — Pilot release
**Pilot scope:** platform + Badminton, Cricket, Tennis, Volleyball, Chess.
- **Match awards** for the pilot sports: auto calculation, manual selection and audited override.
- **Security pass:**
  - rate limits;
  - share-token abuse;
  - upload validation;
  - headers and CORS;
  - DPDP items: notices and consent, data export and deletion, retention/anonymization;
  - the minors policy applied (decision required, §7).
- **Ops:**
  - staging and production in an India region;
  - automated backups plus a restore drill;
  - metrics and alerts (sync backlog, rejection rate, `NEEDS_REVIEW` count, SSE connections);
  - PII-scrubbed error tracking;
  - runbooks (lost device, leaked share link, bad engine release, sync backlog).
- **Distribution:**
  - signed release APK on the official download page, with SHA-256, release notes and minimum Android version;
  - in-app version check;
  - live-update channel;
  - PWA install help (iOS: must be installed to the home screen for offline scoring).

**Exit:** pilot users onboarded and feedback captured, with the follow-up milestones re-prioritized from it.

### M7 — Tournaments, statistics and player profiles
- Tournament create and edit; entries (teams or roster members); deterministic round-robin and single-elimination generation with seeding and byes.
- Each fixture becomes a normal match.
- Per-sport standings strategies with configured tie-breaks; standings snapshot and recalculation.
- Tournament statistics and leaderboards; tournament awards with stale → review → republish after corrections.
- Player and team statistics pages (match, tournament, date range, career), filtered by workspace and privacy. An optional public tournament page via share link.

**Exit:** e2e: create tournament → generate fixtures → score matches → standings → awards → correct a match → award marked stale → republished.

### M8 — Rules builder (TCA)
- DSL schema and evaluator in engine-kit:
  - typed operators;
  - priority then stable ID;
  - depth and cycle limits;
  - derived events;
  - rule-fired metadata.
- Rule catalogues for the 5 pilot sports.
- Builder UI: preset → duplicate → trigger → conditions → engine command → priority/reset → preview against sample events → save as an immutable version.

**Exit:**
- The cricket consecutive-wide example works end-to-end.
- Invalid combinations are blocked.
- Replay is deterministic including derived events.
- Rule effects appear in stats.

### M9 — Timed team sports: Football, Field Hockey, Basketball
- Period clocks, stoppage time, extra time and shootouts.
- Cards and suspensions (hockey), fouls, timeouts, shot clock and overtime (basketball).
- Player stats, plus match and tournament award definitions.
- Each sport meets the full definition of done, including its rule catalogue.

### M10 — Kabaddi, Kho-Kho, Wrestling, Carrom
- **Kabaddi:** raid lifecycle and raid timer, touch/tackle/bonus, all-out, revival, do-or-die, super tackle.
- **Kho-Kho:** chasing and defending turns, turn timer, dismissals, side change.
- **Wrestling:** style and weight metadata, periods, scoring actions, cautions, technical superiority, fall. Weight categories run as separate tournaments.
- **Carrom:** boards, coins, queen and cover, fouls and penalties, match target.
- Each sport meets the full definition of done.

### M11 — v1.0 hardening and release
- Accessibility audit: screen-reader labels on scoring controls, contrast, reduced motion, tap targets.
- Load tests with k6 (event ingestion, SSE fan-out); offline stress and low-memory tests; Android device matrix.
- Hindi localization if the pilot confirms demand.
- Security review and release checklist. The spec's MVP acceptance criteria (spec `plan.md` §E, as amended by §2.2) all pass.

## 6. Testing strategy

- **Engines.** Each engine is tested with:
  - golden logs;
  - property tests (fast-check):
    - `replay(events) == incremental fold`;
    - VOID then re-applying the same command reproduces the original state;
    - invariants always hold (no negative scores; legal balls ≤ overs × 6; and so on);
  - valid and invalid cases for every command.
- **Parity.** The same golden logs run on the Node build (API) and the browser build (Vitest browser mode) in CI.
- **API.** Testcontainers Postgres integration tests covering:
  - the authorization matrix;
  - idempotent retry;
  - epoch conflict;
  - lookup indistinguishability;
  - claim confirmation and admin approval;
  - recovery-code reset and duplicate-phone rejection;
  - tournament recalculation;
  - award staleness;
  - share-token expiry and revocation.
- **Client.** Component tests and Dexie transaction durability tests. Playwright e2e with `setOffline`, reload, and multi-context spectator scenarios.
- **Android.** A per-release device checklist covering:
  - kill/restart durability;
  - background timers;
  - storage persistence;
  - upgrade from the previous APK without data loss.
- **Non-functional.** k6 load tests, a backup restore drill, and the log-scan test for personal data.

## 7. Open decisions (owner / legal)

| Decision | Needed by | Proposed default |
|---|---|---|
| **Minors (under 18).** DPDP Act 2023 and its 2025 Rules require verifiable parental consent for children's data; most obligations phase in by about mid-2027 (confirm with counsel). | Decided for pilot (2026-11-14) | 18+ accounts only; under-18s only as organization-managed roster members. Legal review before v1.0. |
| When to add phone verification (OTP) | Before v1.0, or sooner if squatting shows up in the pilot | Deferred (D25); the design is ready to add it later |
| Password recovery route without verification | M1 | Recovery code + optional verified email; support-assisted otherwise |
| International phone numbers | M1 | India-only UI; E.164 storage keeps it open |
| Offline scoring window without server contact | M3 | 14 days since last refresh, configurable |
| Public broadcast delay | M3 | Off by default, configurable per share |
| Official rule edition per sport | Each sport milestone | Cite the governing body's current edition in the rules content |
| Award metrics and tie-breaks per sport | Each sport milestone | Defaults proposed in the sport package; owner signs off |
| Minimum supported Android version | M0 | Capacitor's minimum; test on low-end devices |
| Tournament formats beyond round-robin and knockout (groups, Swiss for chess) | Post-v1 | Not in v1 |
| Cross-workspace (inter-school) tournaments | Post-v1 | Single-workspace in v1 |
| Organization admins exporting phone numbers | M7 | No |

## 8. Key risks

| Risk | Mitigation |
|---|---|
| Domain correctness of 12 engines (Cricket, Kabaddi, Kho-Kho and Wrestling especially) | Golden logs from real scoresheets; a domain reviewer per sport; field tests |
| Unverified numbers: squatting, impersonation, wrong person claiming a profile | Registration rate limits; "this is my number" report flow; admin-approved claims; verified-owner-wins policy once OTP ships (D25) |
| Lost password and lost recovery code with no email | Support-assisted reset; prompt users to add an email after registration |
| Google developer verification for sideloaded apps (rolling out 2026–2027; India expected in 2027) | Register as a verified developer before the pilot |
| iOS is PWA-only: Safari evicts storage for non-installed sites, and there's no background sync | Require home-screen install for offline scoring; document the limitation |
| Engine drift between offline clients and the server | D19: versioned engines, CI parity tests, minimum-version gate, live updates |
| Local data loss from a Capacitor origin change, or a careless storage migration | Test guarding the Capacitor config; Dexie migrations covered by upgrade tests |
| Scope: 12 sports plus tournaments and awards | Pilot after 5 sports; engine and platform tracks in parallel after M3 |

## 9. Verification

- Each milestone closes only when:
  - its exit criteria pass;
  - CI is green (typecheck, lint, unit, integration, e2e);
  - it is deployed to staging;
  - the Android device checklist passes.
- A sport counts as supported only against the definition of done in §4.
- v1.0 ships when the spec's MVP acceptance criteria (amended by §2.2) pass end-to-end on web, PWA and APK.
- **First step after this plan is accepted: M0.**
