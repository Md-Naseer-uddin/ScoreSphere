# ADR 0014: OTP challenges keyed by phone HMAC (deferred until OTP is added)

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D14](../../plan.md)

## Decision and rationale

When OTP is added, key challenges by a phone HMAC, not a FK to `phone_identities`.
- Identity rows are then created only on verification or an explicit invite.
- Why: otherwise anonymous OTP requests create identity rows for arbitrary numbers.
