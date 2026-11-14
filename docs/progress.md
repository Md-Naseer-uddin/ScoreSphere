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
| M7 — Tournaments, statistics, profiles | done |
| M8 — Rules builder | done |
| M9 — Football, Field Hockey, Basketball | next |
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

**M7**
- **Tournament logic (sports package, pure):**
  - Deterministic round-robin (circle method) and single-elimination fixtures, with standard seeding and byes for top seeds.
  - Standings with configurable tie-breaks from each sport's catalogue: wins, net run rate (ICC all-out rule), game/set/point difference or ratio, Sonneborn-Berger, and head-to-head among tied entries.
  - Leaderboards and player awards summed by roster member across matches.
- **API:**
  - Tournaments with team or roster-member entries, and fixtures with nullable sides and byes (ADR 0023).
  - A match created for a fixture is checked against its entries and the tournament's settings, then linked.
  - Results flow back: knockout winners advance, and a level knockout match waits for an organizer's decision.
  - Standings and leaderboards come from the matches' cached state.
  - Awards (champion, runner-up and the sport's player awards) are published on completion. A later correction marks them stale until an admin republishes.
  - Player, team and personal (cross-workspace) statistics, filterable by tournament or dates.
- **Client:**
  - Tournament list, create (sport settings reused) and detail: entries, fixtures by round with Score and Open, the standings table, leaderboards, awards with republish, and decisions on level knockout matches.
  - Scoring a fixture opens the match wizard pre-filled from it.
  - Player pages, team records and My statistics.
- **Playwright:** a league from entries through fixtures, scoring, standings and awards; a correction makes the awards stale; republishing names the new champion; the player page shows the corrected record.

**Not built in M7:**
- **Public tournament page via share link** (optional in the plan).
- **Organizer overrides of tournament awards:** republishing is supported; manual choice is not yet.
- **Standings snapshots:** standings are computed on read, which is fast enough at pilot scale.

**M8**
- **Rules engine (engine-kit, ADR 0032):**
  - Trigger → condition → action rules as data, in `contracts`. Conditions compare the event's fields or the match's state variables; actions are commands the engine declares.
  - `validateRules` checks rules against the sport's catalogue. It blocks unknown triggers, fields and commands, operators that don't fit a field, bad values, and missing or unknown settings.
  - Rules are pinned in `CREATED`. Their effects are computed in the fold and never stored, so undo and corrections apply to them, and client and server agree.
  - Firing order is priority, then ID. Each rule fires at most once per event, chains stop at depth 3, and there are at most 20 effects per event. An effect the engine refuses is shown and skipped.
- **Catalogues for the five pilot sports:**
  - Cricket adds `penalty_runs` and `reset_wide_count` commands, with state such as wides in a row.
  - In the rally sports, a rule's point is a rally won.
  - Chess adds `add_time` (also FIDE 7.5.5).
  - A golden log reproduces the gully wide penalty as a rule, and its scorecard matches the setting-based one. It runs on both the client and server builds.
- **Preview:** a short sample game per sport, replayed with and without the rules.
- **API:**
  - `rulesets` and immutable `ruleset_versions`. Scorers save; viewers read; admins archive.
  - Rulesets are included in the reference sync for offline use.
  - A match records which ruleset version it came from, only when its rules and settings match that version exactly.
- **Client:**
  - Rulesets list.
  - Builder: sport → settings from a preset → rules from the catalogue only → priority → live check → preview → save as a new version. Duplicating starts a new ruleset from a copy.
  - The match wizard offers the workspace's rulesets.
  - The timeline shows each rule's effect under the event that caused it.
- **Playwright:** build the three-wides rule, preview it, score with it (penalty run on the third wide, removed on undo), the server agrees and links the version, then duplicate the ruleset.

**Not built in M8:**
- **Tournaments with a ruleset:** fixture matches must use the tournament's settings and no custom rules.
- **Penalty runs to the fielding side** (Law 41's five-run penalties carried into their innings). Rule-given penalty runs go to the batting side.
- **Translated rule labels:** catalogue labels are English only.

## Next — M9: Football, Field Hockey, Basketball

Each sport must meet the full definition of done in [plan.md §4](../plan.md):
- settings and presets;
- engine;
- scoring UI;
- undo and corrections;
- timers;
- result and scorecard;
- stats and awards;
- rules help content;
- a rule catalogue;
- golden logs and property tests;
- an offline e2e smoke test;
- the spectator view;
- tournament standings rules.

1. **Timed-period helpers in engine-kit:** period clock, stoppage time, extra time, using the device-owned clock model from M5.
2. **Football:**
   - Goals (own goals, penalties), cards, substitutions, extra time and penalty shoot-out.
   - Stats: goals, assists, cards.
3. **Field Hockey:**
   - Quarters, field goals and penalty corners/strokes, green/yellow/red cards with timed suspensions, and shoot-outs.
4. **Basketball:**
   - Quarters, 1/2/3-point scoring, personal and team fouls (bonus), timeouts, the shot clock as a display aid, and overtime.
   - Stats: points, rebounds and assists where recorded.
5. **Owner sign-off:** award criteria and tie-breaks for each sport.

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
