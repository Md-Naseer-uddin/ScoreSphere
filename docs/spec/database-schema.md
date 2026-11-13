# PostgreSQL Database Schema Specification

## 1. General conventions

- PostgreSQL is the cloud source of truth.
- Use UUID primary keys (`uuid`) for entities exposed through APIs.
- Use `timestamptz` for instants; store event timestamps in UTC and render in the user's timezone.
- Store phone numbers as canonical E.164 strings (`varchar`), never numeric types.
- Store monetary values (if later introduced) as integer minor units or `numeric`, not floating point.
- Use `jsonb` only for versioned sport/rules payloads and flexible domain state, not as a replacement for relational ownership/foreign keys.
- Use `created_at`, `updated_at`, and where appropriate `deleted_at`/`archived_at`.
- Every workspace-owned query must enforce workspace authorization.
- Prefer restrictive foreign keys for historical records. Do not cascade-delete completed matches or events when a team/player is removed.

## 2. Identity and account tables

### `phone_identities`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| phone_e164 | varchar(16) UNIQUE NOT NULL | Canonical number, e.g. +919876543210 |
| country_code | varchar(4) NOT NULL | e.g. +91 |
| national_number | varchar(15) NOT NULL | normalized digits |
| status | enum | PENDING_CLAIM, VERIFIED, CHANGE_PENDING, DISABLED |
| verified_at | timestamptz NULL | Set only after OTP proof |
| created_at | timestamptz | |

A phone identity may be referenced by one user and one participant profile, because the same real person can be both an account owner and a sports participant. Uniqueness on each referencing table prevents duplicates within that domain.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| phone_identity_id | uuid UNIQUE FK | Required; verified identity |
| password_hash | text | Argon2id encoded hash |
| display_name | varchar(100) | |
| optional_email | citext NULL | Optional, not login key |
| email_verified_at | timestamptz NULL | |
| avatar_object_key | text NULL | Object storage reference |
| date_of_birth | date NULL | Optional; apply minor policy |
| bio | varchar(500) NULL | |
| locale | varchar(20) | |
| status | enum | ACTIVE, LOCKED, DISABLED, DELETION_PENDING |
| discoverable_by_phone | boolean | Default false; explicit privacy setting |
| created_at / updated_at | timestamptz | |

Constraints: unique `phone_identity_id`; optional unique email only if product requires unique email. Never store OTP or plaintext password.

### `otp_challenges`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| phone_identity_id | uuid FK | |
| purpose | enum | REGISTER, LOGIN_STEP_UP, CHANGE_PHONE, RECOVERY |
| code_hash | text | Hash, not plaintext OTP |
| expires_at | timestamptz | |
| attempts | int | |
| consumed_at | timestamptz NULL | |
| created_at | timestamptz | |

### `auth_sessions`
`id`, `user_id FK`, `refresh_token_hash`, `device_installation_id`, `expires_at`, `revoked_at`, `created_at`, `last_used_at`. Unique token hashes; rotate refresh tokens.

### `device_installations`
`id`, `user_id FK`, `device_public_id`, `platform`, `app_version`, `last_seen_at`, `revoked_at`, `created_at`. Unique `(user_id, device_public_id)`.

## 3. Workspace and organization tables

### `workspaces`
`id`, `type` (PERSONAL/ORGANIZATION), `name`, `created_by_user_id`, `created_at`, `updated_at`, `archived_at`.

### `organizations`
`id`, `workspace_id UNIQUE FK`, `name`, `slug`, `logo_object_key`, `description`, `contact_email NULL`, `created_at`, `updated_at`.

### `workspace_memberships`
`id`, `workspace_id FK`, `user_id FK`, `role` (OWNER/ADMIN/SCORER/VIEWER), `status` (INVITED/ACTIVE/SUSPENDED/LEFT), `joined_at`, `created_at`. Unique `(workspace_id,user_id)`.

### `workspace_invitations`
`id`, `workspace_id`, `invited_phone_identity_id NULL`, `invited_by_user_id`, `role`, `token_hash`, `expires_at`, `accepted_at`, `revoked_at`.

## 4. Sports and rules tables

### `sports`
`id`, `key UNIQUE`, `name`, `engine_key`, `engine_version`, `description`, `icon_key`, `is_active`, `sort_order`.

Seed: cricket, badminton, tennis, chess, kabaddi, volleyball, basketball, wrestling, football, kho-kho, hockey, carrom.

### `sport_formats`
`id`, `sport_id FK`, `key`, `name`, `default_config jsonb`, `is_active`. Unique `(sport_id,key)`.

### `sport_rule_templates`
`id`, `sport_id FK`, `format_id NULL`, `name`, `category` (OFFICIAL/CASUAL/LOCAL), `ruleset_config jsonb`, `source_name`, `source_url`, `source_version`, `effective_from`, `effective_until`, `created_at`. Do not assume a template's summary replaces the governing body's source document.

### `rulesets`
`id`, `workspace_id FK`, `sport_id FK`, `name`, `description`, `visibility` (PRIVATE/WORKSPACE), `created_by_user_id`, `created_at`, `archived_at`.

### `ruleset_versions`
`id`, `ruleset_id FK`, `version_number`, `config jsonb`, `schema_version`, `engine_key`, `engine_version`, `validation_status`, `created_by_user_id`, `created_at`. Unique `(ruleset_id,version_number)`. Immutable after creation.

## 5. Teams and player identity tables

### `teams`
`id`, `workspace_id FK`, `name`, `short_name NULL`, `logo_object_key NULL`, `description NULL`, `created_by_user_id`, `created_at`, `updated_at`, `archived_at`.

### `players`
`id`, `workspace_id FK`, `phone_identity_id NULL UNIQUE FK`, `linked_user_id NULL UNIQUE FK users`, `display_name`, `avatar_object_key NULL`, `profile_status` (PENDING_CLAIM/CLAIMED/ACTIVE/ARCHIVED), `created_by_user_id`, `discoverability_snapshot` (optional), `created_at`, `updated_at`, `archived_at`.

A `players` record with `phone_identity_id` but no `linked_user_id` is a pending claimable profile. When its verified phone identity is used for registration, link `linked_user_id` to the new user. A player may be created without a phone only if the product explicitly permits workspace-only/manual roster profiles; the preferred registered-player flow uses a phone identity.

### `team_memberships`
`id`, `team_id FK`, `player_id FK`, `jersey_number NULL`, `sport_role NULL`, `joined_at`, `left_at`, `created_at`. Unique active `(team_id,player_id)`; implement partial unique index if retaining history.

### Device-local guest tables (not PostgreSQL)
Guest profiles and reusable guest roster entries live in the creator's local IndexedDB/SQLite only. They have local UUIDs, display name, optional jersey/role and local timestamps. Do not create cloud `users` records for guests. Do not sync their reusable local profiles. If a guest participates in a synchronized match, copy a minimal participant snapshot into the match-side participant snapshot (name and sport-specific public display fields only) so the match remains readable.

## 6. Match tables

### `matches`
`id`, `workspace_id FK`, `sport_id FK`, `format_id NULL FK`, `ruleset_version_id FK`, `tournament_id NULL FK`, `created_by_user_id`, `status` (DRAFT/SCHEDULED/IN_PROGRESS/PAUSED/COMPLETED/CANCELLED), `visibility` (PRIVATE/SHARED), `active_scorer_device_id NULL`, `match_version bigint`, `engine_key`, `engine_version`, `initial_config jsonb`, `current_state jsonb`, `started_at`, `ended_at`, `created_at`, `updated_at`, `archived_at`.

### `match_sides`
`id`, `match_id FK`, `side_number smallint`, `team_id NULL FK`, `display_name`, `side_metadata jsonb`. Unique `(match_id,side_number)`. Supports individual matches where `team_id` is null.

### `match_side_participants`
`id`, `match_side_id FK`, `player_id NULL FK`, `local_guest_id NULL`, `participant_type` (REGISTERED_PLAYER/CLAIMABLE_PLAYER/GUEST_SNAPSHOT), `display_name_snapshot`, `avatar_snapshot NULL`, `jersey_number_snapshot NULL`, `sport_role_snapshot NULL`, `participation_metadata jsonb`.

For a guest, `player_id` and `local_guest_id` must not be sent as reusable cloud identities; persist the minimum snapshot fields needed for the match. A guest snapshot must not be discoverable in the global player directory.

### `match_state_snapshots`
`id`, `match_id FK`, `sequence_number`, `state jsonb`, `created_at`. Unique `(match_id,sequence_number)`. Periodically store projections for fast recovery/replay.

## 7. Scoring, timer and sync tables

### `match_scoring_events`
`id uuid PK`, `match_id FK`, `sequence_number bigint`, `client_event_id uuid`, `device_installation_id NULL FK`, `actor_user_id NULL FK`, `event_type`, `payload jsonb`, `state_version_before`, `state_version_after`, `client_occurred_at`, `server_recorded_at`, `sync_origin` (ONLINE/OFFLINE), `correlation_id NULL`, `corrects_event_id NULL FK`, `created_at`.

Constraints: unique `(match_id,sequence_number)`, unique `(match_id,client_event_id)`. Events are append-only. Corrections/undo are new events linked to previous events.

### `match_timer_states`
`id`, `match_id FK`, `timer_key`, `timer_type`, `status`, `duration_ms`, `elapsed_ms`, `started_at`, `paused_at`, `timer_state jsonb`, `last_event_sequence`. Unique `(match_id,timer_key)`.

### `sync_receipts`
`id`, `device_installation_id FK`, `match_id FK`, `client_event_id`, `server_event_id NULL`, `status`, `error_code NULL`, `received_at`, `acknowledged_at`. Unique `(device_installation_id,match_id,client_event_id)`.

### `outbox_events`
`id`, `aggregate_type`, `aggregate_id`, `aggregate_version`, `event_type`, `payload jsonb`, `created_at`, `published_at NULL`, `attempts`. Create within the same DB transaction as scoring events; publisher sends after commit.

## 8. Tournament tables

### `tournaments`
`id`, `workspace_id FK`, `sport_id FK`, `name`, `description`, `format` (ROUND_ROBIN/SINGLE_ELIMINATION/GROUPS_KNOCKOUT/SERIES), `ruleset_version_id FK`, `status` (DRAFT/REGISTRATION/IN_PROGRESS/COMPLETED/CANCELLED), `start_at`, `end_at`, `tie_break_config jsonb`, `created_by_user_id`, `created_at`, `updated_at`.

### `tournament_entries`
`id`, `tournament_id FK`, `entry_type` (TEAM/PLAYER), `team_id NULL FK`, `player_id NULL FK`, `seed NULL`, `group_key NULL`, `status`. Enforce exactly one of team_id/player_id and unique tournament entry.

### `tournament_rounds`
`id`, `tournament_id FK`, `round_number`, `name`, `stage_type`, `created_at`. Unique `(tournament_id,round_number)`.

### `tournament_fixtures`
`id`, `tournament_id FK`, `round_id FK`, `match_id UNIQUE FK matches`, `fixture_number`, `scheduled_at`, `status`, `next_fixture_id NULL`, `next_side_number NULL`. Matches are the authoritative scored contests; fixtures link them into a tournament structure.

### `tournament_standings_snapshots`
`id`, `tournament_id FK`, `calculation_version`, `standings jsonb`, `calculated_at`. Can be regenerated from completed match results.

## 9. Awards and statistics tables

### `sport_award_definitions`
`id`, `sport_id FK`, `scope` (MATCH/TOURNAMENT), `key`, `display_name`, `description`, `metric_key NULL`, `calculation_config jsonb`, `selection_mode` (AUTO/MANUAL/AUTO_WITH_OVERRIDE), `is_active`.

Examples: PLAYER_OF_MATCH, PLAYER_OF_TOURNAMENT, BEST_BATTER, BEST_BOWLER, TOP_SCORER, MOST_ASSISTS, MOST_REBOUNDS, BEST_DEFENDER, BEST_RAIDER, BEST_CHASER, BEST_SPIKER, depending on sport.

### `award_records`
`id`, `workspace_id FK`, `sport_id FK`, `scope` (MATCH/TOURNAMENT), `match_id NULL FK`, `tournament_id NULL FK`, `award_definition_id FK`, `recipient_player_id NULL FK`, `recipient_team_id NULL FK`, `recipient_snapshot jsonb`, `selection_method` (AUTO/MANUAL/OVERRIDE), `metric_snapshot jsonb`, `criteria_version`, `selected_by_user_id NULL FK`, `override_reason NULL`, `published_at NULL`, `created_at`.

Constraints: exactly one scope target (match or tournament), exactly one recipient (player or team). Unique award per definition/target unless shared winners/ties are explicitly allowed. Store calculation/criteria snapshot so historical awards remain explainable.

## 10. Sharing, audit and media

### `match_shares`
`id`, `match_id FK`, `token_hash UNIQUE`, `permission` (READ_ONLY), `expires_at NULL`, `revoked_at NULL`, `created_by_user_id`, `created_at`, `last_accessed_at NULL`.

### `audit_logs`
`id`, `workspace_id NULL`, `actor_user_id NULL`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `ip_hash NULL`, `created_at`. Avoid logging raw phone numbers, OTPs, passwords or share tokens.

Profile image metadata belongs in `users`/`players`; binary files live in object storage.

## 11. Key integrity rules

1. Phone identity unique globally in the account identity registry; account and pending player may share the same identity only as the same intended person.
2. A verified account cannot be created for a phone already linked to another account.
3. Player phone search never creates a duplicate account.
4. Match references immutable ruleset and engine version.
5. Completed match events are append-only; corrections are separate events.
6. Tournament standings are derived from matches, with stored snapshots for read performance.
7. Award records store scope, recipient, metric snapshot and selection provenance.
8. Workspace access must be checked for every private entity query.
9. Guest reusable profiles are local-only; synced match snapshots are minimal and not global player identities.
10. Hard deletion of users/players must not break completed match history; use anonymization/retention policies where legally required.
