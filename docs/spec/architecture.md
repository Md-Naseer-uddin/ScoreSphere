# System Architecture

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0001](../adr/0001-orm-drizzle.md), [0002](../adr/0002-realtime-sse-listen-notify.md), [0003](../adr/0003-client-storage-dexie.md), [0004](../adr/0004-single-write-path.md), [0005](../adr/0005-undo-void-replace.md), [0007](../adr/0007-scorer-lease-epoch.md), [0010](../adr/0010-global-persons-roster-members.md), [0011](../adr/0011-participant-kinds.md), [0015](../adr/0015-sports-content-in-code.md), [0017](../adr/0017-package-layout.md) (ORM, realtime, client storage, write path, undo, lease, identity, package layout). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

## 1. Architecture recommendation

Use a **TypeScript monorepo with a modular NestJS monolith and a React client**. The same React client is built as a web/PWA application and packaged for Android using Capacitor. PostgreSQL is the server-side source of truth. IndexedDB (web) and SQLite (native Android) hold offline data and pending scoring events.

Do not start with microservices. Sports engines, user management, match lifecycle and synchronization are easier to reason about while they share one transaction boundary and deployment. Split components later only after measured scaling or team ownership needs justify it.

## 2. Logical system context

```text
Users: individuals, organization owners/admins/scorers, spectators
        |
        v
React + TypeScript + Tailwind (web/PWA/Capacitor)
  | API (REST)                 | Realtime (Socket.IO)
  v                            v
NestJS modules  <---------->  Match Gateway
  |
  +-- Auth / Phone Identity / Profiles
  +-- Workspace / Organization / Membership
  +-- Sports / Rules / Rule Evaluator
  +-- Teams / Players / Player Claim
  +-- Matches / Tournaments
  +-- Sport Scoring Engines / Timers
  +-- Awards / Statistics / History
  +-- Sharing / Sync / Audit
  |
  v
PostgreSQL + object storage + optional Redis

Client local data:
- PWA: IndexedDB + Cache Storage
- Android: SQLite + native secure storage
```

## 3. Recommended repository structure (monorepo)

```text
sports-platform/
├── apps/
│   ├── client/                 # React web/PWA; Capacitor wraps this build
│   └── api/                    # NestJS REST + Socket.IO backend
├── packages/
│   ├── contracts/              # API DTOs, shared types, event schemas
│   ├── scoring-core/            # Pure deterministic sport engine interfaces/logic
│   ├── rules-core/              # Safe rule DSL evaluator and validators
│   ├── sport-definitions/       # Sport metadata, action catalogues, rule schemas
│   ├── sync-protocol/           # Sync event envelopes, versioning, ack types
│   └── config/                 # Shared lint/tsconfig where useful
├── docs/                       # This specification pack
├── infra/                      # Docker, deployment and local dev config
├── pnpm-workspace.yaml
├── turbo.json                  # Optional task orchestration
└── package.json
```

### Shared package boundaries

- `contracts`: TypeScript request/response/event definitions only. No database client.
- `scoring-core`: pure domain transitions that can run locally offline and on the server. Server remains authoritative when connected; offline state is provisional until accepted by server.
- `rules-core`: deterministic and sandbox-free evaluator for a typed rules DSL. No `eval`, dynamic imports or user code execution.
- `sport-definitions`: allowed sport actions, condition operands, rule metadata and UI labels.
- `sync-protocol`: stable event envelope, idempotency and acknowledgement types.
- Prisma client/schema stays in `apps/api`; never import database access into the browser app.

## 4. Major architectural decisions

### ADR-001: Monorepo
Use pnpm workspaces; Turbo or Nx is optional. A monorepo enables atomic changes to API contracts and scoring logic and allows the same pure scoring package to run in the client and backend. Use separate deployment pipelines for client and API. Use separate repositories only if independent teams, access-control boundaries, release cadence or external clients later require it.

### ADR-002: Modular monolith
One NestJS deployment with clear domain modules. No microservices for MVP.

### ADR-003: Shared deterministic scoring core
Pure functions handle sport transitions so online and offline scoring use identical rules. Server validates all submitted actions when connected. Package code must not depend on browser APIs, Node-only APIs or database APIs.

### ADR-004: Event ledger plus projection
Accepted scoring actions are append-only records. Current state is a projection derived from events and periodic snapshots. Undo/correction is a compensating event, not destructive deletion.

### ADR-005: Phone number identity
A normalized verified phone identity is unique. The user account and player profile are separate concepts linked to the same identity when appropriate.

### ADR-006: Guest participants are device-local
A guest profile is not a cloud user and is not placed in the global player directory. A match may contain a participant snapshot (name and minimal display fields) for durable scorecards and authorized sharing, but reusable guest contact/profile details stay local.

### ADR-007: Rule version snapshots
A started match references an immutable ruleset version and engine version. Editing a ruleset creates a new version and cannot silently change historical results.

### ADR-008: One active scorer device initially
A match has one write lease/scorer device. Other devices can view live state. This avoids merging simultaneous offline timelines. Explicit handover is a future capability.

### ADR-009: Read-only public sharing
Sharing links grant narrowly scoped read-only access. They are revocable, optionally expiring and stored hashed server-side.

### ADR-010: Award calculation is reproducible
Awards are generated from sport-specific match/tournament statistics with versioned criteria. Manual overrides are audited and visibly identified.

## 5. Data ownership boundaries

- `User`: authentication identity and personal account settings.
- `Workspace`: tenant/data ownership boundary. Every private team, player, ruleset, match and tournament belongs to a workspace.
- `Organization`: organization profile and memberships; the associated workspace owns its operational records.
- `Player`: a reusable participant identity within a workspace, potentially linked to a registered user.
- `Guest`: local-only profile stored on the creator device. Only minimum participant snapshot details are copied to a match record if necessary.
- `Match`: single sporting contest, with sides/participants and scoring event stream.
- `Tournament`: groups multiple matches and calculates standings/awards.
- `RulesetVersion`: immutable configuration used by a match.

## 6. Runtime request flows

### Online scoring
1. Client submits action with event UUID and expected match version.
2. API authenticates user/device and authorizes scorer lease.
3. Engine validates action against current state and ruleset snapshot.
4. Transaction inserts event, updates projection/snapshot and outbox record.
5. Commit succeeds.
6. Outbox publisher broadcasts committed state to the match room.
7. Client confirms local event as synchronized.

### Offline scoring
1. Client applies action locally with shared pure engine.
2. Save local event and state transactionally in IndexedDB/SQLite.
3. Queue event for sync.
4. On reconnection, send ordered batch with stable UUIDs and base version.
5. Server idempotently validates events and returns acknowledgements or conflict details.
6. Client marks only acknowledged events as synced.

### Player claim
1. Workspace member searches exact normalized phone through authenticated, rate-limited endpoint.
2. If discoverable registered account: return permitted profile card; add linked player profile to roster after confirmation.
3. If account exists but is not discoverable: do not expose details; offer an invite/claim request.
4. If no account: create a pending phone identity and player record with supplied name.
5. When the person registers and verifies the same phone, atomically attach the user account to the pending player record.

## 7. Scalability

Start with one API deployment and PostgreSQL. Add Redis when needed for Socket.IO cross-instance broadcast, distributed rate limits or short-lived locks. Use object storage for profile photos. Add a worker for expensive tournament aggregates or notification jobs only when required. Keep match state reads indexed by match ID/version and history queries workspace-scoped and paginated.

## 8. Non-goals for MVP

- Microservices.
- Arbitrary user-executable scoring scripts.
- Multiple concurrent offline scorers for the same match.
- Full professional federation/league administration for every sport.
- Play Store publication requirement.
