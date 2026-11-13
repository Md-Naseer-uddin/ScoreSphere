# ADR 0008: Offline match creation gets a mechanism

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D8](../../plan.md)

## Decision and rationale

- Match IDs are client-generated UUIDv7.
- `MATCH_CREATED` (config + roster snapshot) is event 0, and the creating device holds epoch 1.
- The server materializes the match on first sync.
- Server-originated matches (tournament fixtures) are claimed by a scorer device, which then downloads their config.
