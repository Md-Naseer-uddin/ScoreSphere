# Sync backlog

**Notice:** scorers report "N to sync" that never clears, `scoresphere_live_matches_scorer_quiet`
stays high, or `scoresphere_event_rejections_total` climbs.

The server can't see what is queued on devices, so start from what it can see.

1. **API healthy?** `GET /api/v1/health/ready`. If Postgres is down, events wait safely on
   devices; they sync when it is back. Nothing to do on devices.
2. **Rejections by reason** (`scoresphere_event_rejections_total{code=...}`):

   | Code | Meaning | Action |
   |---|---|---|
   | `NOT_LEASE_HOLDER`, `STALE_EPOCH` | Another device took over | Expected after a takeover; the old device shows "Conflict — local events kept" |
   | `ENGINE_VERSION_MISMATCH` | A device runs a different engine version | Make sure the server ships every engine version |
   | `SEQ_GAP`, `SEQ_TAKEN` | A device's ledger diverged | Ask the scorer to download the events from the match page ("Download events") and contact support; take over from another device if the match is live |
   | `BAD_PAYLOAD` | A client sent a command the server doesn't accept | Likely a client/server mismatch after a release: check the latest deploy |

3. **One device stuck, nothing refused:** usually no signal, or a session older than the
   14-day offline window (ADR 0031). Ask the scorer to open the app online and sign in again;
   queued events then send with the same IDs, and the server ignores duplicates.
4. **Refused events are never lost.** They are kept in `match_event_rejections` and on the
   device; support can export them for review:
   ```sql
   select seq, kind, payload, code, received_at from match_event_rejections where match_id = '<id>' order by seq;
   ```
