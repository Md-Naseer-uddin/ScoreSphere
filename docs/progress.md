# Progress

Tracks where implementation of [plan.md](../plan.md) stands. A resumed session reads this first, then continues from **Next**.

## Status

| Milestone | Status |
|---|---|
| M0 — Foundations | done (on-device APK check pending, see below) |
| M1 — Identity and workspaces | done |
| M2 — People and rosters | done |
| M3 — Walking skeleton: Badminton, offline-first | next |
| M4 — Cricket | not started |
| M5 — Rally family + Chess | not started |
| M6 — Pilot release | not started |
| M7 — Tournaments, statistics, profiles | not started |
| M8 — Rules builder | not started |
| M9 — Football, Field Hockey, Basketball | not started |
| M10 — Kabaddi, Kho-Kho, Wrestling, Carrom | not started |
| M11 — v1.0 hardening | not started |

## Done so far

**M0**
- Monorepo with pnpm, Turborepo, TypeScript 6, ESLint, Prettier and Vitest.
- Shared packages: `contracts`, `engine-kit`, `sports`.
- NestJS API skeleton and React PWA client.
- Capacitor Android project with icons and splash.
- CI that builds and uploads a debug APK.

**M1**
- Phone + password auth with no OTP (ADR 0025), 18+ confirmation (ADR 0026).
- Rotating refresh sessions: a cookie on the web, Keystore storage on Android, reuse detection.
- Account lockout and recovery-code reset.
- Profile, avatar upload (ADR 0028) and device management.
- Organizations, roles, link invitations, workspace switcher.
- Authorization-matrix tests.
- Playwright e2e of onboarding, plus an API log scan for personal data.

**M2**
- Global `persons` and workspace-private roster members with link states (ADR 0029).
- `POST /people/lookup` returns only `DISCOVERABLE | INVITE`; the response is identical for hidden and unknown numbers.
- Claim flow: pending person → registers → confirms → workspace admin approves.
- Teams and team memberships with unique active membership.
- Quick guests in Dexie with promote-to-roster.
- `GET /sync/reference?since=` into Dexie; cleared on logout.
- Client: Teams tab, team detail, roster, add-member sheet, link-by-phone dialog, profile roster-link card.
- Playwright e2e of the roster claim journey.

## Next — M3: Walking skeleton (Badminton, offline-first)

1. **contracts:** event envelope (`eventId`, `localSeq`, `leaseEpoch`, `kind`, `targetSeq`, `engineVersion`), sync request/response (`ACCEPTED | ALREADY_PROCESSED | REJECTED | CONFLICT`), match DTOs, share-link DTOs.
2. **engine-kit:** ledger fold with VOID/REPLACE, lifecycle/roster/clock events, replay, correction re-validation (ADR 0005, 0006).
3. **Badminton engine** in `packages/sports/src/badminton`: singles/doubles, rally scoring, deuce and cap, service court and rotation, settings + presets, stats, Player of the Match, rules content, golden logs + property tests.
4. **API:** `matches`, `match_side_participants`, `match_events`, `match_event_rejections`, `match_share_links` schema; `POST /matches/:id/events` (offline creation via `MATCH_CREATED`, idempotency, lease epoch, accept-and-flag `NEEDS_REVIEW`); `GET /matches/:id/events?after=`; `POST /matches/:id/lease`; match list for history.
5. **Live:** share links (create/revoke/expire), SSE via `LISTEN/NOTIFY` with `Last-Event-ID` catch-up, `/live#token` page with a stale badge.
6. **Client:** match wizard, scoring screen from `commands()`, timeline with undo/correction, summary/scorecard, history list, Dexie event store + sync worker, sync-status UI.
7. **Exit tests (Playwright):** online → offline mid-match → reload → continue → reconnect → every event synced exactly once; spectator joins mid-match; revoked link stops; force-takeover rejects stale events but keeps them.

## Needs the owner

- **On-device check of the CI-built APK:** IndexedDB persists across kill/restart, plus keep-awake.
  - Download it from the latest CI run's `scoresphere-debug-apk` artifact.
  - The APK can't reach an API until one is deployed: it needs `VITE_API_URL` and `VITE_PUBLIC_APP_URL` at build time.
- **Staging deploy target.** Nothing is deployed until a hosting provider is chosen; storage stays on local disk until then.
- **Android developer verification** for sideloaded apps, before the pilot.
