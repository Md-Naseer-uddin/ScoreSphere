# Instructions for Claude Opus 5.5 — Sports Scoring Platform

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0001](../adr/0001-orm-drizzle.md), [0017](../adr/0017-package-layout.md) (Drizzle instead of Prisma, package layout. The root CLAUDE.md replaces this file for day-to-day work). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

You are acting as a principal software architect and senior full-stack engineer. The attached specification pack is the product and engineering source of truth for the multi-sport scoring platform.

## Read first

Read every document in this folder before proposing code changes:
1. `README.md`
2. `plan.md`
3. `architecture.md`
4. `database-schema.md`
5. `identity-player-profiles.md`
6. `sports-rules-engine.md`
7. `scoring-tournaments-awards.md`
8. `api-specification.md`
9. `offline-sync-live-sharing.md`
10. `frontend-spec.md`
11. `backend-spec.md`
12. `security-testing-deployment.md`

## Product decisions that must not be lost

- Support individuals and organizations.
- 12 initial sports: Cricket, Badminton, Tennis, Chess, Kabaddi, Volleyball, Basketball, Wrestling, Football, Kho-Kho, Hockey and Carrom.
- Phone number, not email, is the required unique login identifier. Registration verifies the phone with OTP; subsequent normal login uses phone + password. Optional email is secondary.
- A team member can be added as **Guest** (device-local reusable profile, no lookup) or **Player** (exact phone lookup, existing account/player or pending claim).
- A pending player record must be linked to the same player identity when the person later registers and verifies that phone. Do not create duplicate account/player records.
- User profile picture and personal profile details are supported.
- Each sport has a rules/reference section and its own scoring engine.
- Rules support presets and a validated visual trigger-condition-action DSL. Never execute arbitrary user code.
- Every match keeps immutable scoring events and the exact ruleset/engine versions used.
- Tournament-level awards require first-class tournament/fixture/standings support.
- Awards include match and tournament scope, with sport-specific categories only where relevant and supported by captured statistics.
- Matches are private by default; optional share links are read-only, revocable and optionally expiring.
- Offline scoring is required. Guest reusable profiles remain device-local; a minimal participant snapshot may be saved with a match.
- Use a single active scorer device per match in MVP; other devices are spectators.
- React/PWA and Capacitor Android APK share the frontend.

## Working method

1. Inspect the repository before changing anything. Identify the package manager, folder structure, current framework versions, database, API routes, reusable components, tests and deployment approach.
2. Do not assume the repository is empty. Preserve working code and existing conventions unless there is a demonstrated technical reason to change them.
3. Produce a gap analysis mapping existing code to each specification and plan phase.
4. Propose an implementation sequence and list any contradictions or missing product decisions. Do not silently invent a rule that changes scoring semantics.
5. Implement in small, reviewable vertical slices. For each slice: migration/schema → backend/domain logic → API contract → frontend → tests → documentation.
6. Do not implement all sport scoring engines as one generic `if/else` module. Use the engine contract and separate sport-specific engines.
7. Keep shared pure deterministic scoring/rules code in a package that can run in browser and Node. The backend remains authoritative online.
8. Use migrations. Do not make ad-hoc production schema changes.
9. Do not expose phone numbers or private profile fields in public APIs or logs.
10. Never sync reusable guest profiles to the server; only sync the minimal match participant snapshot if required.
11. Add tests for every scoring transition and custom rule. A sport is not complete without edge-case tests.
12. Never claim a feature is complete unless the code, tests and end-to-end flow exist.

## Repository and implementation preference

Prefer a pnpm monorepo if the project has not already committed to a different structure:

```text
apps/client
apps/api
packages/contracts
packages/scoring-core
packages/rules-core
packages/sport-definitions
packages/sync-protocol
```

Use Prisma only in the backend. Never ship database credentials or server-only code to the client. Keep separate client/API deployment pipelines.

## Phase gates

Follow `plan.md`. Do not skip foundational work such as phone identity, workspace authorization, ruleset versioning, event idempotency or offline persistence. Build vertical slices; begin with authentication/workspaces and then a complete Cricket flow before scaling the pattern to the remaining sports.

## Definition of done

A feature is done only when:
- TypeScript builds and lint passes.
- Relevant unit/integration/e2e tests pass.
- API contracts are documented.
- Authorization and privacy are tested.
- Offline behavior is tested where applicable.
- Error/loading/empty states are implemented.
- No sensitive data is written to logs.
- Documentation is updated.

## Output expectations

At the start of work, provide:
- Repository findings.
- Gap analysis against the specification.
- Proposed phased sequence.
- Risks/ambiguities requiring owner decisions.

During implementation, summarize files changed, migrations, endpoints, tests and known limitations. If a rule or award criterion is ambiguous, make it configurable or ask for a product decision; do not silently assume.
