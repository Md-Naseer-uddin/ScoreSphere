# ADR 0012: Phone lookup no longer distinguishes non-discoverable accounts from no account

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D12](../../plan.md)

## Decision and rationale

- The lookup returns only `DISCOVERABLE` (profile card) or `INVITE`.
- Behind `INVITE`, the server either creates a pending person or sends an association request to the existing account.
- Why: the spec's four-state response tells any authenticated user which numbers are registered, which defeats `discoverable_by_phone=false`.
