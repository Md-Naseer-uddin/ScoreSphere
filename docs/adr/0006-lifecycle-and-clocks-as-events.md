# ADR 0006: Lifecycle, roster changes and clocks become ledger events

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D6](../../plan.md)

## Decision and rationale

- The spec has `/start|pause|resume|finish|cancel` endpoints that mutate `matches.status`, a separate `match_timer_states` table, and server timestamps as clock authority.
- Under that design, an offline pause or finish can't sync, replay can't rebuild clocks, and server timestamps mean nothing for events that arrive hours late.
- Instead, these are all ledger events: start/pause/finish, playing XI, substitutions and clock transitions.
- Timers are derived in the projection. The scoring device owns elapsed time (monotonic clock), and the server accepts the lease holder's timings.
- `matches.status` becomes a projection column used only for queries.
