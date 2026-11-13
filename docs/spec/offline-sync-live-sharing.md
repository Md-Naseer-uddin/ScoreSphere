# Offline-First, Synchronization and Live Sharing Specification

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0002](../adr/0002-realtime-sse-listen-notify.md), [0003](../adr/0003-client-storage-dexie.md), [0004](../adr/0004-single-write-path.md), [0006](../adr/0006-lifecycle-and-clocks-as-events.md), [0007](../adr/0007-scorer-lease-epoch.md), [0008](../adr/0008-offline-match-creation.md), [0009](../adr/0009-accept-and-flag-validation.md), [0019](../adr/0019-engine-versioning.md), [0021](../adr/0021-share-link-fragment.md) (Dexie everywhere, one write path, lease epochs, offline match creation, SSE). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

## 1. Design goals

- User can prepare a match online, then score it without network connectivity.
- Scoring events survive app reload, process termination and device restart as far as the device's storage guarantees allow.
- When connection returns, pending events sync without duplicates.
- Live spectators see committed, authoritative match state.
- One active scorer device per match in the first release; all other clients are read-only.

## 2. Client storage

### PWA/web
- IndexedDB for structured records, event queue, active match state, rules, teams, player references and local guests.
- Cache Storage/service worker for application shell and static assets.
- Request persistent storage where supported; display storage status and provide export/recovery guidance when appropriate.

### Capacitor Android
- SQLite for durable structured local data.
- Native secure storage for session/refresh credentials or device secrets; never store password plaintext.
- Use an adapter interface so feature code is independent of IndexedDB vs SQLite.

### Local tables/stores
- `cached_workspaces`
- `cached_teams`
- `cached_registered_players`
- `local_guest_profiles`
- `local_guest_team_memberships`
- `cached_sports`
- `cached_ruleset_versions`
- `local_matches`
- `local_match_events`
- `local_match_snapshots`
- `sync_queue`
- `sync_receipts`
- `device_settings`

Guest profiles and reusable guest-team links remain local-only. A match can persist a minimal guest participant snapshot when synced.

## 3. Initial offline preparation

1. User logs in online and completes phone verification.
2. Device is registered.
3. Client downloads workspace permissions, teams, selected player profiles, sports definitions, ruleset versions and app shell.
4. Client stores an offline session grant/credential in secure device storage with expiration/revocation policy.
5. User can create a match offline only if required sport/rules/roster configuration is already cached or can be created locally within allowed scope.

Do not promise first-time login while offline. Offline access is available only on a device that has previously authenticated and has a valid offline unlock policy.

## 4. Local scoring transaction

When user taps a scoring action:
1. Generate UUID `eventId`.
2. Read current local match version/sequence.
3. Validate action using shared deterministic scoring core.
4. In one local DB transaction, append event, update local projection/snapshot and insert sync queue row.
5. Render optimistic state only after local transaction succeeds.
6. If online, submit to server; if offline, keep pending.

Never rely on component state alone for score durability.

## 5. Sync envelope

Each event contains:

- event ID (UUID, stable across retries)
- match ID
- device ID
- client local sequence
- expected server match version/base version
- event type and payload
- client timestamp
- ruleset/engine version
- optional correction reference

Server responds for each event with:
- accepted/already processed/rejected/conflict
- server event ID and sequence if accepted
- new match version
- authoritative state or delta/snapshot cursor
- typed error reason if rejected

Client must retry using the same event ID. Never generate a new ID for a retry of an already-submitted action.

## 6. Conflict strategy

MVP policy: one active scorer lease per match. The lease is assigned to a registered device and periodically renewed while online. Offline mode permits the device holding the lease to continue locally for a configured grace period; lease rules must prevent another device from independently scoring the same match. Other devices can view the latest state.

If a stale device submits events after another device has advanced the match:
- Do not silently merge.
- Return conflict with current server state/version.
- Preserve unacknowledged local events for review/export.
- Provide a recovery workflow for an authorized scorer/admin.

Do not let two disconnected devices both become independent writers for one match in MVP.

## 7. App lifecycle and timers

- Persist timer transitions and `startedAt`/`pausedAt`/elapsed values.
- Use monotonic clock in native app where available to reduce wall-clock changes; use timestamp strategy for restart reconstruction.
- On app foreground/resume, reconstruct elapsed time from persisted state.
- Do not depend solely on `setInterval` or background JavaScript execution.
- Chess uses separate player clocks and increment/delay. Kabaddi raid timer is distinct from match timer. Basketball shot clock is distinct from period clock. Football/hockey use period clock and stoppage/penalty timing as configured.
- For competitive precision, define accuracy limits and test device sleep/background scenarios.

## 8. Live sharing

- Private by default.
- Owner/scorer creates a read-only share link.
- Share token is cryptographically random; database stores only hash.
- Support optional expiry and revocation.
- Spectator route does not expose private workspace data, phone numbers, internal IDs or admin controls.
- A spectator joins the match room and receives an initial snapshot followed by committed updates.
- Reconnect sends latest snapshot/version so client can catch up.
- If a match is offline, live spectators see the last server-synchronized state and a stale/offline badge; they cannot see unsynced local actions until sync completes.

## 9. Realtime reliability

Use REST for scorer commands initially, Socket.IO for broadcasts. Persist an outbox event in the same transaction as the match action. A publisher broadcasts only after commit. If publish fails, retry outbox delivery. Client treats event IDs/versions idempotently and ignores duplicate/out-of-order updates until it can reconcile using snapshot.

## 10. Acceptance tests

- Offline event is durable after reload/process death.
- Event retry does not score twice.
- Server rejection preserves local event and shows recovery guidance.
- Two devices cannot both hold the active scorer lease.
- Viewer reconnect gets correct current state.
- Revoked/expired share link stops working.
- Guest reusable profile is not uploaded; match snapshot is enough to render scorecard.
- Timer resumes correctly after background and process restart within documented tolerance.
