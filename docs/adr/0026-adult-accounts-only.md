# ADR 0026: Accounts are 18+ only for the pilot

- **Status:** Accepted (owner decision)
- **Date:** 2026-11-14
- **Source:** [plan.md §1 and §7](../../plan.md)

## Decision and rationale

- Registration requires the user to confirm they are 18 or older. The confirmation is stored with a timestamp.
- Under-18 participants appear only as organization-managed roster members (ADR 0011), never as account holders.
- Why: India's DPDP Act 2023 and its 2025 Rules require verifiable parental consent before processing a child's data. Schools and academies make minors a core case, and a consent flow is out of scope for the pilot.
- Revisit with legal advice before v1.0.
