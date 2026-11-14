# Bad engine release

**Notice:** `scoresphere_matches_needs_review` rises, or users report a wrong scorecard.

Engines are frozen and versioned (`cricket@1`); every match is pinned to the version it
started on, and the server ships all of them (ADR 0019). A bug therefore affects only
matches pinned to the buggy version, and it never rewrites stored events.

1. Find the affected matches:
   ```sql
   select id, sport, engine_version, status from matches where needs_review order by updated_at desc;
   ```
2. Reproduce with the match's ledger (`GET /api/v1/matches/:id/events`) as a new golden log
   in `packages/sports`. It must fail before the fix and pass after.
3. Fix the engine:
   - If the bug changes results of matches already played, ship the fix as a **new engine
     version** (`cricket@2`). Old matches keep `@1` unless an organizer chooses to re-score.
   - If the old version simply crashes or rejects valid events, fixing `@1` in place is
     acceptable: replaying the ledger gives the correct result. Note it in the release.
4. Raise `MIN_CLIENT_VERSION` so devices on the buggy app can't start new matches.
5. Web clients update through the service worker prompt; Android picks up the new web bundle
   from the next APK or live update.
6. Awards are held back while a match needs review (ADR 0009). Once the ledger replays
   cleanly, clear the flag for each match you have checked:
   ```sql
   update matches set needs_review = false where id = '<match id>';
   ```
   The next event or an organizer action republishes its awards.
