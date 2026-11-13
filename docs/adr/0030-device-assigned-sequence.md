# ADR 0030: The scoring device numbers ledger events

- **Status:** Accepted
- **Date:** 2026-11-14
- **Source:** refines ADRs 0004, 0005, 0007 and 0008, and plan §3.4 (`localSeq`, `expectedVersion`)

## Decision and rationale

- The device holding the scorer lease assigns `seq` 1, 2, 3 … to each event. The server never renumbers.
- `seq` 1 is always `CREATED`. The match's `version` is its highest accepted `seq`.
- The server accepts an event only when all of these hold:
  - the device holds the lease;
  - the event carries the current lease epoch;
  - the event uses the match's engine version;
  - `seq` is exactly `version + 1`.
- What happens otherwise:

| Situation | Outcome | Code |
|---|---|---|
| `eventId` already stored | `ALREADY_PROCESSED` | (none) |
| Another device holds the lease | `CONFLICT` | `NOT_LEASE_HOLDER` |
| Older lease epoch | `CONFLICT` | `STALE_EPOCH` |
| `seq` already taken | `CONFLICT` | `SEQ_TAKEN` |
| `seq` skips ahead | `REJECTED` | `SEQ_GAP` |
| Different engine version | `REJECTED` | `ENGINE_VERSION_MISMATCH` |
| Command payload malformed | `REJECTED` | `BAD_PAYLOAD` |

- Every refused event is kept in `match_event_rejections`.
- An event that passes those checks but that the server engine refuses is still stored, and the match is flagged `needs_review` (ADR 0009).
- Why:
  - `VOID` and `REPLACE` must name their target before the target reaches the server; device-assigned `seq` lets them, even offline.
  - With one writer per epoch (ADR 0007), a device-assigned `seq` is as reliable as a server one.
  - It replaces both the separate `localSeq` and `expectedVersion` fields: `seq` *is* the expected version plus one.
- After a takeover, the new device downloads the ledger and continues from the server's `version`.
