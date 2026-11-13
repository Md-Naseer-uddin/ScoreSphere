# Multi-Sport Scoring Platform — Technical Specification Pack

**Document status:** Product/engineering baseline for implementation planning  
**Version:** 1.1  
**Last updated:** 2026-11-13  
**Primary stack:** React + TypeScript + Tailwind CSS, NestJS, PostgreSQL, Prisma, Socket.IO, PWA, Capacitor

## 1. Purpose

This document pack defines a mobile-first, offline-capable, multi-sport scoring platform for individuals and organizations. It covers sports scoring, rules configuration, teams, players, tournaments, awards, match history, live sharing, phone-number identity, offline synchronization, web/PWA delivery and Android APK distribution.

The application must support the first 12 sports:

1. Cricket
2. Badminton
3. Tennis
4. Chess
5. Kabaddi
6. Volleyball
7. Basketball
8. Wrestling
9. Football (association football)
10. Kho-Kho
11. Field Hockey
12. Carrom

The architecture must allow additional sports to be registered without redesigning the platform's core data model.

## 2. Product decisions confirmed by the product owner

- The product serves **both individuals and organizations** (schools, colleges, clubs, academies and sports groups).
- Account login identifier is a **unique verified 10-digit Indian mobile number**, replacing email as the required login identifier. Password remains required. Email may be an optional secondary contact/recovery field, not the primary identity key.
- A phone number must be verified by OTP before an account is activated or the number is changed.
- Teams can include two categories of participant:
  - **Guest:** no account lookup; reusable guest profile exists only on the creator's device.
  - **Player:** lookup by phone number; attach an existing account/player profile when found, or create a pending claimable player identity if not found.
- When a pending player later registers using the same verified phone number, link the new account to the existing player identity instead of creating a duplicate player profile.
- Users can set a profile picture and additional personal details.
- Each sport has its own rules/help section.
- Rules are configurable through presets and a visual trigger-condition-action builder.
- Matches are private by default, with optional read-only live sharing.
- Offline scoring is a core requirement, not a later enhancement.
- Android distribution must support signed APK download without Play Store publication. A PWA is also required.
- Awards include Player of the Match, tournament awards and sport-specific awards such as Best Batter and Best Bowler where applicable.
- Tournaments and their matches/results/awards are part of the supported product scope because tournament-level awards require aggregation across multiple matches.

## 3. Files in this pack

| File | Purpose |
|---|---|
| `plan.md` | Complete phased frontend/backend implementation plan and integrated build sequence |
| `architecture.md` | System architecture, modules, key decisions and deployment topology |
| `database-schema.md` | PostgreSQL entities, relationships, constraints and indexing strategy |
| `identity-player-profiles.md` | Phone login, account claiming, player lookup, guest/player semantics and profile requirements |
| `sports-rules-engine.md` | Sport catalogue, rulebook content model and configurable rules engine |
| `scoring-tournaments-awards.md` | Sport scoring requirements, event ledger, tournament model and awards/statistics |
| `api-specification.md` | REST endpoints, request/response contracts and Socket.IO events |
| `offline-sync-live-sharing.md` | PWA/native persistence, offline scoring, synchronization and live score sharing |
| `frontend-spec.md` | Mobile-first UX, routes, screens, components and states |
| `backend-spec.md` | NestJS modules, domain boundaries, transactions and service responsibilities |
| `security-testing-deployment.md` | Security, privacy, test strategy, deployment and APK release |
| `CLAUDE.md` | Instructions for Claude Opus 5.5 to inspect and implement the existing/new codebase against these specs |

## 4. Priority conventions

- **MUST:** Required for the agreed first production release.
- **SHOULD:** Strongly recommended; may be sequenced after the first usable end-to-end sport.
- **MAY:** Optional/future enhancement.

The 12 listed sports are in the initial product scope. Ship them in vertical slices, with a fully tested end-to-end flow for each sport. Do not label a sport as supported until its scoring engine, timer behavior where applicable, result model, rules, undo/replay and tests are implemented.

## 5. Product principles

1. Mobile-first, scoring-first UX.
2. Sport-specific engines behind a shared platform contract.
3. Rules are data/configuration, never arbitrary user-supplied executable code.
4. Every accepted scoring action is recorded as an immutable event.
5. Current match state is a projection derived from events and periodic snapshots.
6. Offline data must be durable and recoverable; synchronization must be idempotent.
7. A match has one active scorer device in the first release; other clients are viewers.
8. Private by default; live links are explicit, read-only, revocable and optionally expiring.
9. Guest profiles are device-local; historical match participant snapshots may sync when needed to preserve scorecards.
10. Account identity is based on a verified phone identity, not on a name or player record.
11. Tournament and award calculations must be explainable, reproducible and manually overrideable with an audit trail.
12. Completed historical matches retain the exact ruleset and engine versions used.

## 6. How to use this pack

Read `CLAUDE.md` first. Then read all documents before editing code. Treat the requirements in this pack as the baseline, but inspect the actual repository before making assumptions about existing implementation. If the repository already contains code, preserve working features and adapt incrementally. Do not replace the architecture wholesale without identifying a concrete need and documenting the proposed change.

## 7. Open product decisions to confirm during discovery

These are intentionally left configurable rather than assumed:

- Whether the first release supports only Indian `+91` mobile numbers or allows international country codes later. The initial registration field is 10 digits for India; store canonical E.164 format internally.
- OTP provider and whether OTP is required at every login (recommended: OTP for registration/phone changes and password recovery; password for normal login).
- Age/guardian consent policy if minors are expected to create accounts.
- Exact official rulebook edition for each sport and competition level.
- Which competition formats (round-robin, knockout, groups, league) are in the tournament MVP.
- Exact award metrics and tie-break criteria per sport.
- Whether organization administrators can export participant phone numbers (default: no; avoid exposing phone numbers in exports unless specifically authorized).
- Guest roster retention and cross-device migration policy (default: device-local only; provide manual export/import only if later required).
