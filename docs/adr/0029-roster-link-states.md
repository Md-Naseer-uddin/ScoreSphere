# ADR 0029: Roster link states instead of an association-requests table

- **Status:** Accepted
- **Date:** 2026-11-14
- **Source:** refines plan §3.5 (`association_requests`) and ADRs 0010–0013, 0025

## Decision and rationale

- Each `roster_members` row carries a `link_status` and an optional `person_id`. There is no separate requests table.

| `link_status` | Meaning | Next step |
|---|---|---|
| `NONE` | Name-only roster member, private to the workspace | A scorer links a person, by lookup or phone |
| `LINKED` | Confirmed link to a person | (none) |
| `PENDING_CONSENT` | An existing account was invited | The user accepts (→ `LINKED`) or declines (→ `NONE`) |
| `PENDING_CLAIM` | The number had no account yet | After sign-up the user confirms (→ `AWAITING_APPROVAL`) or declines (→ `NONE`) |
| `AWAITING_APPROVAL` | The user says "that's me" | A workspace admin approves (→ `LINKED`) or rejects (→ `NONE`) |

- A CHECK constraint keeps `person_id` null exactly when the status is `NONE`.
- The API reports `PENDING_CONSENT` and `PENDING_CLAIM` as one `INVITED` state, so neither the lookup nor the roster reveals whether a number is registered (ADR 0012).
- Why: every request in the spec is about exactly one roster member, so its state belongs on that row. A second table would duplicate it and could disagree with it.
- The extra admin approval exists only because numbers are unverified (ADR 0025). Once OTP verification ships, `PENDING_CLAIM` can move straight to `LINKED`.
