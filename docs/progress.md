# Progress

Tracks where implementation of [plan.md](../plan.md) stands. A resumed session reads this first, then continues from **Next**.

## Status

| Milestone | Status |
|---|---|
| M0 — Foundations | done (on-device APK check pending, see below) |
| M1 — Identity and workspaces | done |
| M2 — People and rosters | done |
| M3 — Walking skeleton: Badminton, offline-first | done (on-device check pending) |
| M4 — Cricket | built; exit pending owner (real scoresheets, field test) |
| M5 — Rally family + Chess | done (Android screen-lock/kill check pending) |
| M6 — Pilot release | built; launch pending owner (hosting, keystore, legal review, pilot users) |
| M7 — Tournaments, statistics, profiles | next |
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

**M3**
- **Contracts:** event envelope, batch sync protocol, lease, share links and live snapshots.
- **Ledger:** engine-kit fold with VOID/REPLACE, lifecycle events and playing time.
  - Strict replay on the device, lenient replay on the server (accept and flag, ADR 0009).
  - The scoring device numbers events (ADR 0030).
- **Badminton engine:** singles and doubles, rally scoring, deuce and cap, service courts and doubles rotation.
  - Presets: BWF 3×21 and 3×15 (official), plus two casual ones.
  - Stats, Player of the Match and rules content citing the BWF Laws.
  - Golden logs (including the Law 11 doubles service example) and property tests, run against the package, the server build and the client build.
- **API:**
  - `POST /matches/:id/events` handles offline creation, idempotency, lease epoch fencing and kept rejections.
  - Lease claim, takeover, release and heartbeat.
  - History, detail and ledger reads.
  - Share links, plus SSE live streams over `LISTEN/NOTIFY` with `Last-Event-ID` catch-up.
- **Client:**
  - Dexie match store and a sync worker with all six sync states.
  - Offline start as the last signed-in account (ADR 0031).
  - Match wizard (roster members, quick guests or typed names).
  - Scoring screen with undo, corrections, pause, early finish, abandon and handover; keeps the screen awake.
  - Match summary and scorecard, history, take-over and the `/live#token` spectator page with a stale badge.
- **Playwright:**
  - Offline scoring through a reload, with every event stored exactly once.
  - A spectator who joins mid-match catches up; a revoked link stops working.
  - A takeover fences the old device off and keeps its events.

**M4**
- **Cricket engine (limited overs, one innings a side), following the MCC Laws:**
  - Batters are tracked by end, so run-outs at either end and the 2022 caught rule work.
  - Explicit delivery kinds: wides, no-balls (off the bat, byes or leg-byes), byes and leg-byes.
  - Free hits that carry over wides and no-balls.
  - All dismissals, with the right ones credited to the bowler.
  - Retired hurt (can return) and retired out.
  - Mid-over bowler changes (a split over is never a maiden).
  - Consecutive-over and per-bowler limits.
  - Declarations and concessions.
  - Super overs: once, or until decided.
- **Presets:** T20, one-day (official); T10 and box (casual); gully (local).
  - Local variants are typed settings: last man stands, six and out (runs count or not), one tip one hand, consecutive-wide penalty, consecutive overs allowed.
- **Stats:** batting, bowling and fielding, plus Player of the Match, Best Batter and Best Bowler with stated tie-breaks.
- **Tests:** 7 constructed golden logs with hand-worked scorecards and property tests (runs reconcile across batters, extras and bowlers). They run against the package, the server build and the client build.
- **Client:**
  - Match setup with named sides and saved teams, cricket settings and toggles.
  - Phase-driven scoring: toss, openers, bowler (invalid choices disabled with the reason), run pad with extras panels, wicket form, retire, swap strike, change bowler, declare.
  - Full scorecard (batting, extras, did not bat, fall of wickets, bowling, awards) on the summary and live pages.
  - Taps extend a cached projection instead of replaying the ledger.
- **Playwright:** a cricket chase finished offline through a reload, then synced with each event stored once.

**Still open in M4:**
- Real scoresheet golden logs and a field test (owner, below).
- Concussion replacements as `ROSTER` events: deferred. They need a way to add a participant snapshot after creation without putting names in events (ADR 0024). The playing XI is the roster chosen at setup.

**M5**
- **engine-kit:**
  - Device-time clocks (`Clock`, `formatClock`).
  - An `onLifecycle` hook, so pausing stops a chess clock without charging the player.
  - `validate` receives the event's device time.
  - Live snapshots carry `serverNow` and the scorer's clock offset, so spectators can show running clocks.
- **Tennis:**
  - Games with advantage or no-ad scoring, and tie-break sets.
  - Deciding set: tie-break, advantage or a match tie-break.
  - Singles and doubles service order, including serving inside a tie-break.
  - Change-of-ends prompts.
  - Presets: ITF best of 3, match tie-break and best of 5; short sets and pro set.
- **Volleyball:**
  - Rally scoring with a deciding set, and line-ups with clockwise rotation on side-outs.
  - First-serve alternation per set (new toss in the decider).
  - Per-set substitution and timeout limits.
  - Optional point credits (attack, block, ace) feeding MVP, Best Spiker and Best Blocker, which appear only when credits exist.
- **Chess clock:**
  - Base time, Fischer increment, delay and staged time controls.
  - Flag fall, recorded as a loss or a draw (Article 6.9), and every result type.
  - Presets: classical, rapid, blitz, bullet, no clock.
- **Tests:**
  - Golden logs and property tests for each engine, including exact chess clock accounting through presses and pauses.
  - Every engine's golden logs run against the server and client builds.
- **Client screens** for all three sports.
- **Playwright:**
  - A chess clock stays within ±1 s (plus display rounding) after going offline and a reload.
  - Tennis and volleyball scored offline through a reload, then synced.

**Not done in M5:**
- **Shared rally/set helpers:** not extracted. Badminton, tennis and volleyball differ enough (service rules, tie-breaks, rotation) that each engine stays self-contained.
- **Volleyball:** libero replacements and substitution re-entry rules are not checked yet. The rules content says so.

**M6**
- **Match awards:**
  - `award_records` with provenance (auto, manual, override), criteria version, metric snapshot and status.
  - Recomputed automatically when a completed match changes; withdrawn if it reopens; held back while it needs review.
  - Organizers (admins) select or override with a reason. It is audited, and goes stale if the match changes afterwards.
  - One awards card on the match and live pages; provisional before sync.
- **Privacy (DPDP):**
  - Privacy notice and terms pages (marked for legal review), with a consent notice at registration.
  - `GET /me/export`.
  - `POST /me/deletion` anonymises the account: number erased and re-registrable; personal workspace deleted; organisation rosters unlinked. It refuses to strand an organisation without an owner.
  - A "Your data" card that also clears the account's data from the device.
- **Security:**
  - Production config guards: CORS origins, rate limits, https links.
  - `TRUST_PROXY` for per-client rate limits behind a proxy.
  - Header and CORS tests.
  - A strict CSP and headers on the web app (nginx).
- **Ops:**
  - Docker images (API and web), built and smoke-tested locally.
  - Production compose with a migration job (`node dist/migrate.js`).
  - Backup and restore scripts.
  - Prometheus metrics behind a token.
  - Scrubbed error reports to an optional webhook.
  - Runbooks: deploy, backup and restore drill, lost device, leaked link, bad engine release, sync backlog.
  - Scoring devices re-send events the server lost (e.g. after a restore).
- **Distribution:**
  - `GET /app/version` with a minimum-version gate on new matches (ADR 0019).
  - `/download` page with the APK checksum and PWA install help.
  - A tag-triggered release workflow that signs the APK once secrets exist and publishes it with its SHA-256.

**Not built in M6:**
- **Live-update channel** for the APK's web bundle: needs a choice of self-hosted service; until then, updates ship as new APKs.
- **Broadcast delay** on live links: plan §7 default is off.

## Next — M7: Tournaments, statistics and player profiles

1. **Schema (ADR 0023):**
   - `tournaments`.
   - `tournament_entries`: a team or a roster member.
   - `tournament_fixtures`: nullable sides and match, with byes.
   - Standings snapshots.
   - Tournament-scope awards.
2. **Fixture generation:** deterministic round-robin and single-elimination, with seeding and byes. Each fixture becomes a normal match, claimed by a scorer device (ADR 0008).
3. **Standings:** a strategy per sport with configured tie-breaks; recalculated when a match changes.
4. **Statistics and awards:**
   - Tournament statistics and leaderboards.
   - Tournament awards that go stale and are reviewed after corrections.
5. **Profiles:**
   - Player and team statistics pages (match, tournament, career), filtered by workspace and privacy.
   - An optional public tournament page via share link.
6. **Exit (e2e):** create tournament → fixtures → score → standings → awards → correct a match → award stale → republished.

## Needs the owner

- **On-device check of the CI-built APK:** IndexedDB persists across kill/restart, plus keep-awake.
  - Download it from the latest CI run's `scoresphere-debug-apk` artifact.
  - The APK can't reach an API until one is deployed: it needs `VITE_API_URL` and `VITE_PUBLIC_APP_URL` at build time.
- **Staging deploy target.** Nothing is deployed until a hosting provider is chosen; storage stays on local disk until then.
- **Android developer verification** for sideloaded apps, before the pilot.
- **M3 on-device check:** on the CI-built APK, score a badminton match offline, kill and reopen the app, reconnect, and check the screen stays awake while scoring.
- **Badminton rules sign-off:**
  - The 3×15 interval and change-of-ends points. The preset leaves those prompts off until they're confirmed from the 2027 Laws.
  - Player of the Match goes to the winning side (partners share it) and isn't awarded automatically for a walkover.
- **Golden logs from real scoresheets:** the current badminton logs are constructed (except the Law 11 example), and M4 needs real cricket scoresheets, including a gully match. Please share photos or PDFs of a few local scoresheets.
- **Cricket sign-off:**
  - Proposed award criteria (impact points; most runs, then fewest balls; most wickets, then fewest runs).
  - Super-over stats are left out of player totals.
  - One tip one hand is credited to the bowler like a catch.

- **M5 on-device check:** on the APK, run a chess clock, lock the screen and kill the app, then reopen; the displayed time should be within ±1 s.
- **Pilot launch:**
  - Hosting in an India region (staging and production).
  - The APK signing keystore, stored as repository secrets for `release.yml`.
  - An error-tracking webhook.
  - A lawyer's review of the privacy notice and terms.
  - The pilot group of users.
