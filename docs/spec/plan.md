# Complete Phased Implementation Plan

> **Superseded (2026-11-14):** the root [plan.md](../../plan.md) replaces this plan. Kept for reference only.

**Scope:** React + TypeScript + Tailwind frontend; NestJS backend; PostgreSQL/Prisma; Socket.IO; offline PWA; Capacitor Android APK.  
**Product:** Individual + organization use, 12 sports, configurable rules, phone identity, device-local guests, tournaments, awards, history and live sharing.

## A. Delivery strategy

Use **vertical slices**. Build a feature from database/API through UI and tests before moving to the next major capability. All 12 sports are in the initial product scope, but develop them in manageable groups. A sport is complete only when scoring, state transitions, undo/correction, persistence, result summary, rules and tests work together.

Suggested release gates:

- **Gate 0 — Foundation:** architecture, CI, migrations, API conventions and shared contracts.
- **Gate 1 — Identity/workspaces:** phone login, profiles, personal and organization workspace.
- **Gate 2 — Core sports platform:** sports catalogue, rulebook, ruleset versioning, teams and players.
- **Gate 3 — End-to-end scoring:** first sport complete, then remaining sports.
- **Gate 4 — Tournament/awards/history:** match-level and tournament-level results and recognitions.
- **Gate 5 — Live/offline:** read-only live sharing and reliable offline synchronization.
- **Gate 6 — Release:** PWA, APK, security, performance and operational readiness.

## B. Frontend implementation plan — React + Tailwind CSS

### FE Phase 1 — Project inspection, setup and application architecture
**Objective:** Establish a maintainable React application without duplicating existing infrastructure.

**Tasks:** inspect repository, package manager, TypeScript, routing, Tailwind, linting, existing API client, state management and tests. Set up feature-oriented folders, environment validation, route guards, query client, error boundary and API error normalization. Add PWA foundations only after the app shell routes are stable.

**Components/modules:** AppShell, Router, Providers, ProtectedRoute, ErrorBoundary, API client, query provider.

**Deliverables/tests:** runnable app, typed environment configuration, lint/typecheck/test commands and route smoke tests.

### FE Phase 2 — Design system and mobile navigation
**Objective:** Establish consistent, thumb-friendly UI.

**Tasks:** tokens for colors/spacing/typography, button/input/card/dialog/sheet/toast/badge/skeleton components, safe-area handling, focus states, bottom navigation, empty/loading/error states, dark/light theme decision.

**Deliverables/tests:** responsive component gallery and visual checks at small Android, large Android, tablet and desktop widths.

### FE Phase 3 — Registration, login and account recovery
**Objective:** Use verified phone number as the unique account identifier.

**Screens:** enter phone, OTP verification, create password, login with phone/password, forgot/reset password, change phone, logout, session-expired state.

**Rules:** India registration UI accepts exactly 10 digits after country code `+91`; client normalization is convenience only—the backend is authoritative. Do not reveal whether a phone already has an account in unauthenticated flows.

**Deliverables/tests:** complete auth flows, keyboard/OTP handling, generic error states and protected-route tests.

### FE Phase 4 — User profile and device settings
**Objective:** Let users manage their account/profile.

**Fields:** profile photo, display name, legal/optional full name, phone (verified), optional email, date of birth (optional), preferred language, city/region (optional), bio (optional), privacy/discoverability preferences. Add change-photo, remove-photo, crop/preview, upload progress, profile validation, device list, app PIN/biometric setup if supported.

**Deliverables/tests:** profile create/edit/view, image limits and failure states; no unnecessary sensitive details.

### FE Phase 5 — Workspace and organization experience
**Objective:** Support both personal and organization users.

**Screens:** workspace switcher, personal dashboard, create organization, organization dashboard, members, invitations, roles, settings. Show workspace context clearly on team/match creation.

**Deliverables/tests:** workspace switching, role-based visible actions and access-denied states.

### FE Phase 6 — Dashboard and sports catalogue
**Objective:** Make starting a match fast.

**Dashboard:** Start match, resume match, recent matches, favourite sports, recent teams, pending sync badge, tournaments, quick stats.

**Sports catalogue:** Cricket, Badminton, Tennis, Chess, Kabaddi, Volleyball, Basketball, Wrestling, Football, Kho-Kho, Hockey, Carrom. Each sports card opens its own overview, rules and match-format page.

**Deliverables/tests:** catalogue search/filter/favourites and dashboard personalization.

### FE Phase 7 — Sport rules and rule templates
**Objective:** Present sport-specific rules in readable language.

**Screens:** rules overview, scoring basics, match formats, official rule source/version, glossary, examples, FAQs, local/casual presets. Use accordion sections and short examples. Clearly label official vs simplified explanations.

**Deliverables/tests:** each of 12 sports has an initial rules page and source/version metadata.

### FE Phase 8 — Custom rules builder
**Objective:** Configure match rules without code.

**Screens:** choose preset, duplicate preset, edit settings, add trigger, add condition, select action, configure reset condition/priority, validate, preview examples, save new version.

**UX constraints:** only expose sport-compatible triggers/conditions/actions; explain rule priority; show conflicts/invalid combinations; never permit arbitrary scripts.

**Deliverables/tests:** cricket consecutive-wide example; at least one meaningful configurable example for each rules engine; invalid rule combinations are blocked.

### FE Phase 9 — Team and player management
**Objective:** Maintain reusable rosters with clear guest/player distinction.

**Team screens:** create/edit team, logo, sport tags, roster, team details, archive team.

**Add-member flow:**
1. Select **Guest** or **Player**.
2. Guest: enter name and optional local details; no phone lookup; store reusable guest profile only in this creator's device-local database.
3. Player: enter exact 10-digit phone; search authenticated phone directory. If a discoverable registered player is found, show permitted profile card and add after confirmation. If an account exists but profile is not discoverable, show a privacy-safe invite/request flow. If no account/player exists, collect name and phone and create a pending claimable player profile. When that person later verifies/registers using the same number, link the account to the existing player identity.

**Deliverables/tests:** no duplicate player on account claim; guests remain device-local; user profile privacy respected.

### FE Phase 10 — Match creation wizard
**Objective:** Configure a match using a common flow with sport-specific options.

**Steps:** select sport → select match type → select teams/players → choose ruleset/version → configure format/timers → choose scorer/device → review → start.

Support practice/friendly and tournament match creation. Show warnings when selected roster count or configuration conflicts with the ruleset.

**Deliverables/tests:** match creation for all 12 sports, including individual, doubles and team formats where applicable.

### FE Phase 11 — Sport-specific live scoring interfaces
**Objective:** Implement scoring UI for all 12 engines.

**Requirements:** large touch targets, current score, period/over/set/round, active player/side, timer, event log, undo/correction, pause/resume, finish, scorer identity, local-save confirmation and live/offline indicators.

**Delivery sequence:** Cricket → Badminton/Tennis → Chess → Kabaddi/Volleyball → Basketball/Wrestling → Football/Hockey → Kho-Kho/Carrom. This is a suggested sequence, not a priority judgment on product scope.

**Deliverables/tests:** complete end-to-end match flow for every sport.

### FE Phase 12 — Timer controls and recovery UI
**Objective:** Make timers usable and reliable.

**Screens/components:** elapsed/countdown timer, period clock, two-player chess clock, increment/delay display, raid timer, shot clock, timeout/penalty clock, extra time. Use timestamps/elapsed duration from state; do not assume browser intervals run continuously in background.

**Deliverables/tests:** background/resume, screen lock, app reload and offline timer recovery tests.

### FE Phase 13 — Match event timeline, scorecards and correction
**Objective:** Make matches auditable and easy to correct.

**Screens:** event timeline, scorecard, player participation, undo confirmation, correction reason, match result summary. Corrections create compensating events; avoid deleting historical scoring events.

**Deliverables/tests:** replayed UI state matches engine output after undo/correction/reload.

### FE Phase 14 — Tournaments, fixtures and standings
**Objective:** Support tournament-level matches and awards.

**Screens:** create tournament, choose sport/format, select participants/teams, fixtures, groups, knockout bracket, schedule, live/completed matches, points table, standings and tournament overview.

**Initial formats:** round-robin/league and single-elimination knockout; groups may follow if not needed at first launch. Tournament formats must have explicit tie-break configuration.

**Deliverables/tests:** create tournament, attach matches, progress rounds, calculate standings and show tournament history.

### FE Phase 15 — Awards and recognitions
**Objective:** Display player/team awards at match and tournament scope.

**Match awards:** Player of the Match and sport-specific awards. Cricket: Best Batter, Best Bowler, Player of the Match. Football: Player of the Match, Top Scorer and other supported metrics. Basketball: MVP/Player of the Match, Top Scorer, Rebounds Leader, Assists Leader. Add applicable awards for other sports from each sport's statistics contract.

**Tournament awards:** Player of the Tournament, Best Batter/Bowler, Top Scorer, MVP, best defender/keeper/spiker/raider/chaser or other sport-specific categories where metrics exist. Show whether an award is auto-calculated or manually selected. Support an authorized organizer's override with a reason.

**Deliverables/tests:** award cards, leaderboards, tie explanations and audited manual selection.

### FE Phase 16 — Player profiles and statistics
**Objective:** Show a player's history across teams and sports where permitted.

**Screens:** profile, sports played, recent matches, career/season statistics, awards, tournament appearances, team affiliations and privacy settings. Do not display private data just because the player was added to a team.

**Deliverables/tests:** correct filtering by workspace, sport, tournament and time range.

### FE Phase 17 — Live sharing and spectator page
**Objective:** Let people watch a match without being able to score.

**Screens:** share dialog, expiry/access settings, copy link, QR, public live match page, connection/reconnecting status, current score, clock and event feed. Spectator page is read-only and should not require an account if the owner created a public share link.

**Deliverables/tests:** join mid-match, reconnect, revoked/expired link and mobile spectator layout.

### FE Phase 18 — Offline-first experience and synchronization
**Objective:** Score safely without connectivity.

**Tasks:** local persistence, match resume, cached sport/rules/player/team data, local guest roster, pending event queue, sync badge, manual retry, conflict/rejection UI, storage warning and offline account unlock.

**Deliverables/tests:** offline scoring after first online setup, reload/process death recovery, idempotent retry and no silent event loss.

### FE Phase 19 — PWA and Capacitor Android
**Objective:** Install on devices and distribute Android APK directly.

**Tasks:** manifest, icons, service worker/app shell, install prompt/help, Capacitor Android project, SQLite adapter, secure device credential storage, splash screen, status bar/safe area, build/sign APK, version check and release notes.

**Deliverables/tests:** installable PWA and signed APK tested on supported Android versions/devices.

### FE Phase 20 — Accessibility, hardening and release
**Objective:** Production-ready UX.

**Tasks:** accessibility audit, keyboard support, screen-reader labels, high contrast, localization-ready strings, performance profiling, offline stress test, low-memory testing, image compression, error reporting and release checklist.

**Deliverables/tests:** production frontend build with documented browser/device support.

## C. Backend implementation plan — NestJS + PostgreSQL

### BE Phase 1 — NestJS foundation
Set up modular monolith, config validation, logging, exception filters, DTO validation, Swagger, API versioning, health checks, test infrastructure, CORS and security headers. Deliver a deployable empty API.

### BE Phase 2 — PostgreSQL, Prisma and migration workflow
Create PostgreSQL database, Prisma schema/migrations, transaction conventions, UUIDs, constraints, indexes, seed mechanism and backup policy. Establish test database reset strategy. Deliver version-controlled migrations.

### BE Phase 3 — Phone identity and authentication
Implement phone normalization, OTP challenge/verification, password hashing, login, refresh-token rotation, sessions, logout, password reset, phone change and device registration. Store phone canonicalized as E.164 string (initial Indian UI accepts 10 digits and normalizes to `+91XXXXXXXXXX`). Enforce uniqueness in the phone identity registry. OTP provider is an adapter, not hardcoded to one vendor.

### BE Phase 4 — User profiles and media
Implement profile data, avatar upload through object storage, signed upload/download URLs, profile privacy/discoverability and optional email. Validate image MIME/size, strip unsafe metadata where applicable and store file key rather than image bytes in PostgreSQL.

### BE Phase 5 — Workspaces, organizations and authorization
Implement personal workspace creation, organizations, memberships, invitations, roles, permissions and workspace ownership checks. Every workspace-owned query must include the authorized workspace scope.

### BE Phase 6 — Sports catalogue and rule metadata
Seed the 12 sports, engine keys, formats, timer capabilities, triggers, conditions, actions, rules help metadata and official source references. Keep sport metadata data-driven, but scoring behavior in typed engines.

### BE Phase 7 — Rulesets and versioned rule engine
Implement presets, custom rulesets, immutable versions, schema validation, deterministic evaluation, priority, reset conditions, cycle/depth limits and compatibility checks. Persist the exact version on match start.

### BE Phase 8 — Teams, players and player claiming
Implement teams, roster membership, registered player profiles, phone search, pending claimable player identities, invitations/association requests, account-claim linking, duplicate prevention and consent/privacy controls. Implement guest players in local storage only; accept minimal participant snapshots for synchronized match records.

### BE Phase 9 — Match and tournament foundations
Implement match lifecycle, match sides/participants, sport/format/ruleset snapshot, scorer device assignment and tournament entities. Support league/round-robin and knockout tournament formats with fixture/round metadata.

### BE Phase 10 — Shared scoring-event ledger and state projection
Implement event IDs, event sequence, actor/device metadata, payload schema validation, idempotency, event append, state projection, snapshot and replay. Corrections/undo are recorded as compensating events with actor/reason.

### BE Phase 11 — Sport scoring engines (12)
Implement independent engines and validators for Cricket, Badminton, Tennis, Chess, Kabaddi, Volleyball, Basketball, Wrestling, Football, Kho-Kho, Hockey and Carrom. Each engine supports initialization, allowed actions, validation, transition, result, replay, undo/correction and tests. Avoid generic scoring assumptions.

### BE Phase 12 — Timers
Implement timer domain model and persisted transitions. Support chess dual clocks with increment/delay, kabaddi raid timer, football/hockey period clocks, basketball quarter/shot clocks, wrestling periods and optional timers for other sports. Store timestamps/elapsed values; do not depend on server process memory as the only timer source.

### BE Phase 13 — Tournament progression and standings
Implement fixtures, round/group progression, standings calculation, tie-break policy, team/player tournament statistics and tournament completion. Keep standings reproducible from match results.

### BE Phase 14 — Awards and recognitions
Implement sport/scope award definitions, metric aggregation, candidate calculation, tie policies, manual selection/override with audit record, award snapshots and publication. Support match and tournament awards. Do not assume every award applies to every sport.

### BE Phase 15 — Match result, history and statistics APIs
Implement paginated history, match detail, scorecard, event timeline, player/team statistics, tournament leaderboards and award queries. Use sport-specific stat adapters and cached/materialized aggregates only where needed.

### BE Phase 16 — Live sharing and realtime gateway
Implement hashed share tokens, expiry/revocation, read-only access, Socket.IO authentication/authorization, match rooms, snapshot-on-join, post-commit broadcasting and reconnect protocol. Add Redis adapter only when horizontal scaling requires it.

### BE Phase 17 — Offline synchronization
Implement registered devices, event batch push/pull, idempotency receipts, acknowledgement, sequence/version validation, one-active-scorer lock/lease, stale device handling and conflict responses. Persist sync state transactionally.

### BE Phase 18 — Audit, security and privacy
Implement audit logs, rate limits, phone enumeration controls, workspace authorization, share access controls, secret handling, data retention, account deletion/export, request validation, abuse controls and security tests.

### BE Phase 19 — Performance and operational readiness
Profile event ingestion and reads, add indexes, use keyset pagination where needed, configure connection pooling, health/readiness checks, metrics, tracing/logging, database backup/restore drill and deployment automation.

### BE Phase 20 — Production release
Deploy API/database, configure secrets and domains, TLS, migrations, monitoring, alerts, backups, rollback procedure and incident runbook.

## D. Integrated build order

1. Foundation + auth + phone verification + profiles.
2. Workspaces + organization roles.
3. Sports catalogue + rules/help content.
4. Ruleset versioning + visual builder API.
5. Teams/players + guest/player add flow + pending claim linking.
6. Match creation + tournament foundation.
7. Cricket end-to-end vertical slice (engine, UI, persistence, undo, tests).
8. Badminton and tennis vertical slices.
9. Chess and timer foundation.
10. Kabaddi and volleyball.
11. Basketball and wrestling.
12. Football and hockey.
13. Kho-Kho and Carrom.
14. Tournament standings + awards + player/team history.
15. Live share and spectators.
16. Offline persistence + synchronization + conflict recovery.
17. PWA + Capacitor APK.
18. Security, performance and release.

## E. MVP acceptance criteria

The first public release is acceptable only when:

- A user registers using a verified unique phone number and password.
- A user can manage a profile photo and profile details.
- Personal workspace and organization workspace permissions work.
- Guest and registered/pending Player roster flows work as specified.
- A pending player account claim links to the existing player record after phone verification.
- All 12 sports have a rules section and a functioning scoring engine for at least the selected initial format.
- Every match stores immutable scoring actions and its ruleset/engine version.
- Match and tournament awards can be calculated or manually assigned where appropriate.
- A user can create a tournament, attach matches and view standings for the supported formats.
- Live sharing is read-only, revocable and optionally expiring.
- A match continues to be scoreable offline after initial online setup and synchronizes without duplicate events.
- PWA installation and signed Android APK installation are documented and tested.
- Authorization tests demonstrate that users cannot access another workspace's private records.
