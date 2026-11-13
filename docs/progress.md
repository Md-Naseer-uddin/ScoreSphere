# Progress

Tracks where implementation of [plan.md](../plan.md) stands. A resumed session reads this first, then continues from **Next**.

## Status

| Milestone | Status |
|---|---|
| M0 — Foundations | done (on-device APK check pending, see below) |
| M1 — Identity and workspaces | done |
| M2 — People and rosters | next |
| M3 — Walking skeleton: Badminton, offline-first | not started |
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

## Next — M2: People and rosters

1. Schema:
   - `persons`;
   - `roster_members`;
   - `association_requests`;
   - `teams` and `team_memberships`.
   Follow plan §3.5 and ADRs 0010–0013.
2. `POST /people/lookup` returns only `DISCOVERABLE | INVITE`. INVITE creates a pending person or an association request.
3. Claim confirmation at registration, plus workspace-admin approval (ADR 0013, 0025).
4. Roster members (name only, workspace-private); linking a roster member to a person by invite.
5. Quick guests in Dexie, with promote-to-roster.
6. Reference-data sync to Dexie (`GET /sync/reference?since=`).
7. Client: Teams tab, team detail and roster, add-member sheet (Player / Roster member / Quick guest).
8. Exit tests:
   - pending player → registers → confirms → admin approves → the same person is on the roster;
   - lookup responses are indistinguishable for non-discoverable accounts and for no account;
   - a second scorer sees roster members on another device.

## Needs the owner

- **On-device check of the CI-built APK:** IndexedDB persists across kill/restart, plus keep-awake.
  - Download it from the latest CI run's `scoresphere-debug-apk` artifact.
  - The APK can't reach an API until one is deployed: it needs `VITE_API_URL` and `VITE_PUBLIC_APP_URL` at build time.
- **Staging deploy target.** Nothing is deployed until a hosting provider is chosen; storage stays on local disk until then.
- **Android developer verification** for sideloaded apps, before the pilot.
