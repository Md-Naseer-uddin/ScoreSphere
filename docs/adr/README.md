# Architecture decision records

Each record explains a decision that changes or extends the original spec in [docs/spec/](../spec/). Where the spec and a record disagree, the record wins. ADRs 0001–0025 mirror [plan.md §2.2](../../plan.md) D1–D25.

| ADR | Decision |
|---|---|
| [0001](0001-orm-drizzle.md) | ORM: Prisma → Drizzle ORM + drizzle-kit SQL migrations *(owner)* |
| [0002](0002-realtime-sse-listen-notify.md) | Realtime: Socket.IO + outbox + Redis adapter → Server-Sent Events (SSE) + Postgres `LISTEN/NOTIFY` |
| [0003](0003-client-storage-dexie.md) | Client storage: IndexedDB (web) + SQLite (Android) → Dexie/IndexedDB on both |
| [0004](0004-single-write-path.md) | One write path |
| [0005](0005-undo-void-replace.md) | Undo and correction: per-engine compensating logic → ledger-level `VOID(seq)` and `REPLACE(seq, command)` |
| [0006](0006-lifecycle-and-clocks-as-events.md) | Lifecycle, roster changes and clocks become ledger events |
| [0007](0007-scorer-lease-epoch.md) | Scorer lease: time-based lease with an offline grace period → lease with no time expiry, plus a monotonically increasing `lease_epoch` (fencing token) on every event |
| [0008](0008-offline-match-creation.md) | Offline match creation gets a mechanism |
| [0009](0009-accept-and-flag-validation.md) | Server validation policy: accept and flag instead of drop |
| [0010](0010-global-persons-roster-members.md) | Player identity: global `persons` + workspace-scoped `roster_members` |
| [0011](0011-participant-kinds.md) | Three participant kinds *(owner)* |
| [0012](0012-phone-lookup-privacy.md) | Phone lookup no longer distinguishes non-discoverable accounts from no account |
| [0013](0013-claim-confirmation.md) | Account claim requires explicit confirmation |
| [0014](0014-otp-challenges-deferred.md) | OTP challenges keyed by phone HMAC (deferred until OTP is added) |
| [0015](0015-sports-content-in-code.md) | Sports catalogue, formats, presets, award definitions and rules help content live in code, not DB seed tables |
| [0016](0016-rules-engine-two-layers.md) | Rules engine in two layers, sequenced after the engines exist |
| [0017](0017-package-layout.md) | Package layout by sport, not by layer |
| [0018](0018-build-order.md) | Build order re-sequenced (§5) |
| [0019](0019-engine-versioning.md) | Engine version drift is managed explicitly |
| [0020](0020-session-transport.md) | Session transport (the spec left it open) |
| [0021](0021-share-link-fragment.md) | Share links move to the URL fragment |
| [0022](0022-uuidv7-ids.md) | IDs are UUIDv7 everywhere |
| [0023](0023-tournament-award-schema.md) | Tournament and award schema fixes |
| [0024](0024-pii-free-events.md) | Event payloads are free of personal data |
| [0025](0025-phone-verification-deferred.md) | Phone numbers are not verified for now *(owner)* |
| [0026](0026-adult-accounts-only.md) | Accounts are 18+ only for the pilot *(owner)* |
| [0027](0027-apk-built-in-ci.md) | The Android APK is built in GitHub Actions *(owner)* |
