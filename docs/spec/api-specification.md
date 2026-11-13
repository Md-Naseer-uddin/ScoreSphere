# REST API and Realtime Contract Specification

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0002](../adr/0002-realtime-sse-listen-notify.md), [0004](../adr/0004-single-write-path.md), [0006](../adr/0006-lifecycle-and-clocks-as-events.md), [0007](../adr/0007-scorer-lease-epoch.md), [0012](../adr/0012-phone-lookup-privacy.md), [0015](../adr/0015-sports-content-in-code.md), [0020](../adr/0020-session-transport.md), [0021](../adr/0021-share-link-fragment.md), [0025](../adr/0025-phone-verification-deferred.md) (single events endpoint, SSE instead of Socket.IO, lookup, sessions, share links, no OTP). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

Base path: `/api/v1`. Use JSON, UUID IDs and consistent error envelopes. All private endpoints require an authenticated session/token and workspace authorization. Exact implementation may use secure cookie sessions or short-lived access tokens plus rotating refresh tokens; document the final choice.

## 1. Standard response conventions

Success:

```json
{ "data": {}, "meta": { "requestId": "..." } }
```

Paginated list:

```json
{ "data": [], "meta": { "cursor": null, "hasMore": false } }
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": [{ "field": "phone", "code": "INVALID_PHONE" }]
  },
  "meta": { "requestId": "..." }
}
```

Never return stack traces, SQL details, password hashes, OTP hashes, raw refresh tokens or secret share-token hashes.

## 2. Authentication and profile

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | Request registration/recovery/phone-change OTP |
| POST | `/auth/otp/verify` | Verify OTP and issue a short-lived verification grant |
| POST | `/auth/register` | Create account after verified phone grant |
| POST | `/auth/login` | Login with phone + password |
| POST | `/auth/refresh` | Rotate refresh session/token |
| POST | `/auth/logout` | Revoke current session |
| POST | `/auth/password/forgot` | Begin password reset |
| POST | `/auth/password/reset` | Complete reset with verified grant |
| POST | `/auth/phone/change` | Start phone-number change |
| GET | `/users/me` | Get current account/profile |
| PATCH | `/users/me` | Edit profile details |
| POST | `/users/me/avatar/upload-url` | Request signed image upload |
| POST | `/users/me/avatar/complete` | Confirm avatar upload |
| GET | `/users/me/devices` | List devices |
| DELETE | `/users/me/devices/:id` | Revoke device/session |

Registration request example:

```json
{
  "phone": "+919876543210",
  "verificationGrant": "short-lived-opaque-grant",
  "password": "user-secret",
  "displayName": "Asha"
}
```

The grant is issued only after OTP verification. Registration must atomically claim the phone identity and any pending player record.

## 3. Workspace and organization

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/workspaces` | List user's workspaces |
| POST | `/organizations` | Create organization/workspace |
| GET | `/organizations/:id` | Organization profile |
| PATCH | `/organizations/:id` | Update organization |
| GET | `/workspaces/:id/members` | List members |
| POST | `/workspaces/:id/invitations` | Invite by phone identity |
| PATCH | `/workspaces/:id/members/:memberId` | Change role/status |
| DELETE | `/workspaces/:id/members/:memberId` | Remove member |

All endpoints validate current user membership and role.

## 4. Sports and rules

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/sports` | List supported sports |
| GET | `/sports/:sportKey` | Sport metadata |
| GET | `/sports/:sportKey/rules-content` | User-facing rules and sources |
| GET | `/sports/:sportKey/formats` | Match formats |
| GET | `/sports/:sportKey/rule-templates` | Built-in rule presets |
| GET | `/rulesets` | Workspace rulesets |
| POST | `/rulesets` | Create ruleset |
| GET | `/rulesets/:id` | Read ruleset and versions |
| POST | `/rulesets/:id/versions` | Create immutable new version |
| POST | `/rulesets/:id/validate` | Validate draft config |
| POST | `/rulesets/:id/preview` | Evaluate sample actions for preview |

## 5. Teams and players

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/teams` | Create team |
| GET | `/teams` | List teams |
| GET | `/teams/:id` | Team details/roster |
| PATCH | `/teams/:id` | Update team |
| POST | `/teams/:id/memberships` | Add registered/claimable player |
| DELETE | `/teams/:id/memberships/:membershipId` | Remove membership (do not delete player) |
| POST | `/players/phone-lookup` | Exact authenticated phone lookup |
| POST | `/players/pending-claim` | Create claimable player from name + phone |
| GET | `/players/:id` | Player profile permitted to caller |
| PATCH | `/players/:id` | Update permitted player profile |
| POST | `/players/:id/association-requests` | Request account/player association or workspace join |
| POST | `/players/association-requests/:id/accept` | Player accepts request |

Phone lookup result enum:

- `REGISTERED_DISCOVERABLE`: return minimal allowed profile card.
- `REGISTERED_NOT_DISCOVERABLE`: do not disclose profile details; offer invite/association request.
- `PENDING_CLAIM`: an unclaimed profile exists; do not create another.
- `NO_ACCOUNT`: invite flow can create pending player record after name confirmation.

The lookup endpoint must be authenticated, exact-match, rate-limited and privacy-aware.

## 6. Matches and scoring

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/matches` | Create draft/scheduled match |
| GET | `/matches` | Paginated match list/filter |
| GET | `/matches/:id` | Match details and current state |
| PATCH | `/matches/:id` | Edit allowed pre-start fields |
| POST | `/matches/:id/start` | Validate configuration and start |
| POST | `/matches/:id/pause` | Pause match/timers |
| POST | `/matches/:id/resume` | Resume match/timers |
| POST | `/matches/:id/actions` | Submit scoring action |
| GET | `/matches/:id/actions` | Fetch event timeline/cursor |
| POST | `/matches/:id/corrections` | Correct prior action with reason |
| GET | `/matches/:id/scorecard` | Sport-specific scorecard |
| GET | `/matches/:id/result` | Final/current result |
| POST | `/matches/:id/finish` | Finish match |
| POST | `/matches/:id/cancel` | Cancel match |

Scoring action must include stable `eventId`, `deviceId`, `expectedMatchVersion`, `eventType` and validated `payload`. Return `ACCEPTED`, `ALREADY_PROCESSED`, `CONFLICT` or a typed rejection. A duplicate event ID must never apply twice.

## 7. Tournaments and awards

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/tournaments` | Create tournament |
| GET | `/tournaments` | List tournaments |
| GET | `/tournaments/:id` | Tournament details |
| PATCH | `/tournaments/:id` | Edit allowed settings |
| POST | `/tournaments/:id/entries` | Add team/player entry |
| POST | `/tournaments/:id/fixtures/generate` | Generate rounds/fixtures |
| GET | `/tournaments/:id/fixtures` | List fixtures |
| GET | `/tournaments/:id/standings` | Get computed standings |
| GET | `/tournaments/:id/statistics` | Tournament statistics |
| POST | `/tournaments/:id/awards/calculate` | Recalculate award candidates |
| GET | `/tournaments/:id/awards` | Get award records/candidates |
| POST | `/tournaments/:id/awards` | Manually select/override award with reason |
| GET | `/matches/:id/awards` | Match awards |
| POST | `/matches/:id/awards/calculate` | Calculate match awards |

## 8. History and statistics

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/history` | Workspace/user match history |
| GET | `/players/:id/statistics` | Player statistics by sport/range |
| GET | `/teams/:id/statistics` | Team statistics |
| GET | `/statistics/overview` | Workspace/user dashboard aggregates |

Require pagination, filters and workspace scoping. Statistics response must include metric key, value, unit, scope and calculation version.

## 9. Sharing

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/matches/:id/shares` | Create read-only share token |
| GET | `/matches/:id/shares` | List share configurations |
| DELETE | `/matches/:id/shares/:shareId` | Revoke share |
| GET | `/public/matches/:token` | Get permitted public state |

Do not use sequential match IDs as public tokens. Hash share tokens in database. Public endpoint returns only fields explicitly permitted by the share policy.

## 10. Sync

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/sync/matches/:id/events` | Push ordered offline event batch |
| GET | `/sync/matches/:id/events` | Pull events after cursor/version |
| GET | `/sync/devices/:id/status` | Device synchronization status |
| POST | `/sync/matches/:id/claim-scorer` | Acquire/renew scorer lease |
| POST | `/sync/matches/:id/release-scorer` | Release scorer lease |

Sync response acknowledges each event individually and includes server sequence/version and typed conflicts. Client removes only acknowledged events from pending queue.

## 11. Socket.IO events

Namespace or gateway: `/matches`.

Client → server:
- `match:join` (share token or authenticated membership)
- `match:leave`
- `match:request-snapshot`

Server → client:
- `match:snapshot`
- `match:state-updated`
- `match:action-accepted`
- `match:timer-updated`
- `match:status-changed`
- `match:connection-status`

Spectators cannot emit scoring actions. For scorer action submission, prefer REST for durable idempotent commands and use Socket.IO for server-to-client broadcasts initially. If socket writes are added later, they must use the same command service and authorization/transaction path.

## 12. API contract quality requirements

- Publish OpenAPI specification.
- Use DTO validation and typed enums.
- Do not return entire database rows.
- Never trust client workspace IDs without membership authorization.
- Every mutation is authenticated and authorized except explicitly public read-only share routes.
- Use idempotency keys for retryable mutations.
- Standardize errors and correlation/request IDs.
- Use cursor pagination for growing event history.
