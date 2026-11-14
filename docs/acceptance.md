# MVP acceptance criteria

The spec's MVP acceptance criteria ([spec plan §E](spec/plan.md)) as amended by [plan.md](../plan.md) and the ADRs, with the evidence for each (plan M11). "Automated" means the test runs in CI on every push.

Status as of 14 November 2026: **12 of 13 criteria are met with automated evidence. The APK criterion is partly met**: the signed build and on-device check need the owner.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Users register with a unique phone number and password. *Amended:* there is no OTP (ADR 0025), so the number is unique but not verified by SMS. | Met | API `auth.int.test.ts`; e2e `onboarding.spec.ts` (register, sign out, sign in, reset with the recovery code) |
| 2 | Users manage a profile photo and profile details. | Met | API `avatar.int.test.ts` (signature check, re-encoding, metadata stripped) and `me.int.test.ts` |
| 3 | Personal and organization workspace permissions work. | Met | API `workspaces.int.test.ts` (authorization matrix for every role); e2e `onboarding.spec.ts` (organization, invite, join) |
| 4 | Guest and Player roster flows work. *Amended:* three kinds of participant, adding roster members (ADR 0011). | Met | API `people.int.test.ts`, `teams.int.test.ts`; client quick-guest tests; e2e `rosters.spec.ts` |
| 5 | A pending player's claim links to the existing record, without duplicates. *Amended:* the user confirms and a workspace admin approves, instead of phone verification (ADRs 0013, 0025). | Met | e2e `rosters.spec.ts` ("a player added by phone claims their profile…"); API `people.int.test.ts` (lookup responses can't be told apart; no duplicate persons) |
| 6 | All 12 sports have a rules section and a working scoring engine for at least the initial format. | Met | One engine per sport in `packages/sports`, each with golden logs and property tests, also run on the client and server builds (parity tests). Rules help on each sport's page. An offline e2e test per sport: `cricket`, `matches` (badminton), `m5` (tennis, volleyball, chess), `timed-team` (football, hockey, basketball), `raid-chase` (kabaddi, kho-kho), `combat-cue` (wrestling, carrom). |
| 7 | Every match keeps immutable scoring actions and its ruleset and engine version. | Met | The append-only ledger (`match_events`; undo and correction by VOID and REPLACE, ADR 0005). `matches.engine_version`, the preset or `ruleset_version_id`, and rules pinned in CREATED (ADR 0032). API `matches.int.test.ts`, `rulesets.int.test.ts` |
| 8 | Match and tournament awards are calculated, or assigned by hand where appropriate. | Met | API `awards.int.test.ts` (automatic, override with reason, stale after changes); e2e `cricket.spec.ts` (override) and `tournaments.spec.ts` (stale, then republished) |
| 9 | Users create a tournament, attach matches and view standings. | Met | API `tournaments.int.test.ts`; e2e `tournaments.spec.ts` (league fixtures, scoring, standings, awards) |
| 10 | Live sharing is read-only, revocable and can expire. | Met | API `live.int.test.ts` (scorers only, revocation ends streams, expired links refused); e2e `matches.spec.ts` (a spectator follows the match) |
| 11 | A match can be scored offline after setup and syncs with no duplicate events. | Met | e2e `matches.spec.ts` ("syncs each event exactly once"), and the offline-and-reload test of every sport; client `sync-worker.test.ts` |
| 12 | PWA installation and the signed Android APK are documented and tested. | **Partly met** | Documented: the download page (PWA install help, APK checksum and minimum Android version; e2e `privacy.spec.ts`) and [runbooks/deploy.md](runbooks/deploy.md). Tested: CI builds the debug APK on every push, and `release.yml` signs release builds. **Still to do:** the keystore and the on-device checks (see [progress.md](progress.md), "Needs the owner"). |
| 13 | Users cannot reach another workspace's private records. | Met | Authorization matrices in API `workspaces`, `teams`, `people`, `matches`, `tournaments`, `stats` and `rulesets` tests (outsiders get 404, lower roles 403) |

## Also checked in M11

- **Accessibility:** e2e `accessibility.spec.ts` runs axe (WCAG 2.1 A and AA) on:
  - every main page and the rules builder;
  - each of the 12 scoring screens and match pages;
  - three screens in dark mode.

  There are no serious or critical violations.
- **Performance:**
  - Long ledgers (a 50-over-a-side match, a 1,000-event basketball game) replay in milliseconds (`performance.test.ts`).
  - API load results are in [runbooks/load-testing.md](runbooks/load-testing.md).
- **Security:** see [security-review.md](security-review.md).
