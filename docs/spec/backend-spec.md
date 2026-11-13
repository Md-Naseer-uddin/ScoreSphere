# Backend Technical Specification — NestJS

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0001](../adr/0001-orm-drizzle.md), [0002](../adr/0002-realtime-sse-listen-notify.md), [0005](../adr/0005-undo-void-replace.md), [0006](../adr/0006-lifecycle-and-clocks-as-events.md), [0009](../adr/0009-accept-and-flag-validation.md), [0010](../adr/0010-global-persons-roster-members.md), [0015](../adr/0015-sports-content-in-code.md), [0025](../adr/0025-phone-verification-deferred.md) (Drizzle, SSE, undo, lifecycle events, validation policy, identity, no OTP). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

## 1. Backend principles

- Modular monolith with clear bounded modules.
- PostgreSQL through Prisma.
- DTO validation on every write endpoint.
- Authorization enforced in service/domain layer, not only controller route guards.
- One shared command path for REST and any future socket writes.
- Database transactions for scoring event + projection + outbox.
- No arbitrary user code execution in rules.

## 2. Module responsibilities

| Module | Responsibility |
|---|---|
| AuthModule | OTP, phone identity, password, sessions, recovery |
| UsersModule | Profile, avatar metadata, privacy settings |
| PhoneIdentityModule | Normalize, reserve, verify, claim and change phone identity |
| WorkspacesModule | Personal workspaces, ownership and workspace scope |
| OrganizationsModule | Organization profile and membership |
| SportsModule | Sport registry, formats, rules reference metadata |
| RulesModule | Templates, versions, DSL validation and evaluation |
| TeamsModule | Teams and roster memberships |
| PlayersModule | Registered player profiles and pending account claims |
| MatchesModule | Match lifecycle, sides, participants and configuration |
| ScoringModule | Event ingestion, engine registry, projections and corrections |
| TimersModule | Clock state transitions and persisted timing |
| TournamentsModule | Entries, fixtures, rounds, standings |
| AwardsModule | Definitions, candidate aggregation, manual selection and publication |
| StatisticsModule | Sport-specific aggregate queries |
| SharingModule | Share tokens, visibility and spectator access |
| MatchGateway | Socket.IO room authorization and broadcasts |
| SyncModule | Device leases, offline event batches and acknowledgements |
| AuditModule | Security/business audit records |
| MediaModule | Signed object-storage upload and safe media metadata |

## 3. Scoring command service

`SubmitScoringAction` should:
1. Authenticate actor and device.
2. Confirm match/workspace access and active scorer lease.
3. Check stable client event ID for duplicate.
4. Load match projection/snapshot and expected version.
5. Load pinned ruleset and engine version.
6. Validate action with engine and rule evaluator.
7. Apply deterministic transition and create one or more domain events.
8. In a DB transaction: insert event rows, update projection/version, update required stats/outbox.
9. Commit.
10. Publish committed event through outbox processor.
11. Return authoritative state/version/sequence.

If expected version is stale, return typed conflict. Do not guess merge semantics. For an already-processed client event ID, return previous acknowledgement.

## 4. Engine registry

Register sport engine implementations using a stable `engine_key` and compatible `engine_version`. The match pins the version. New releases must retain replay support for older active/historical matches or provide a documented migration/replay strategy.

## 5. Rules evaluator

- Validate rule config against sport schema before activation.
- Evaluate typed conditions only.
- Enforce priority and loop/depth limits.
- Emit rule-fired metadata for explainability.
- Final state must pass sport invariant validator.
- Keep rule evaluator deterministic and versioned.

## 6. Phone/player linking transaction

When registering a verified phone:
1. Validate verification grant and uniqueness.
2. Find or claim `phone_identities` record.
3. Check for pending player linked to that identity.
4. Create user account.
5. Link the pending player to new user or create a player profile if product policy requires it.
6. Create personal workspace and membership.
7. Commit atomically.

Do not create an unrelated new player row if a pending claim exists.

## 7. Guest boundary

Backend does not manage reusable guest directories. Client sends a minimal participant snapshot when creating/syncing a match. Backend validates snapshot length/fields and stores it only under that match. Do not add it to `players` or phone lookup.

## 8. Award calculation service

- Read completed eligible match results and sport-specific statistics.
- Use award definition and criteria version.
- Calculate candidate ranking/ties.
- Save candidate/metric snapshot.
- Allow organizer selection/override only with permission and reason.
- Recompute when underlying match is corrected; mark prior award stale and require review/republication rather than silently changing public awards.

## 9. Tournament service

- Validate all entries belong to tournament workspace or have explicit participation grant.
- Generate fixtures deterministically.
- Link each fixture to a normal match.
- Standings derived from completed matches and fixed tie-break configuration.
- Store calculation snapshot and version.
- Tournament award calculation aggregates only eligible matches within that tournament.

## 10. Authorization model

Use guards for authentication and coarse roles, but every service method must also verify ownership/membership and resource scope. A user cannot supply another workspace ID to access records. Spectator share tokens authorize only read-only permitted match projections and never scoring or private roster fields.

## 11. Transactions and concurrency

- Use short database transactions.
- Use unique constraints for idempotency.
- Use optimistic match version checks.
- Use a single scorer lease per match in MVP.
- Avoid network calls (SMS, media storage, socket broadcast) inside a database transaction.
- Use transactional outbox for broadcasts/notifications.

## 12. Observability

Log request ID, actor ID, workspace ID, match ID, event ID, engine version and result code when safe. Never log OTPs, passwords, refresh tokens, raw share tokens or full phone numbers. Monitor scoring action latency/rejection, sync backlog, outbox retries, Socket.IO connections, timer drift reports, DB connections and error rates.
