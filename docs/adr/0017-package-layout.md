# ADR 0017: Package layout by sport, not by layer

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D17](../../plan.md)

## Decision and rationale

- The spec's `contracts / scoring-core / rules-core / sport-definitions / sync-protocol` become:
  - `contracts` (Zod: API DTOs, sync envelope, error codes);
  - `engine-kit`;
  - `sports` (one folder per sport);
  - `config`.
- Adding a sport means adding one folder. Zod contracts are validated at runtime on both sides and generate OpenAPI, with no duplicated class-validator DTOs.
