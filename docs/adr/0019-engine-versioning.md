# ADR 0019: Engine version drift is managed explicitly

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D19](../../plan.md)

## Decision and rationale

- Engine modules are frozen and versioned (`cricket@1`, `cricket@2`), and the server ships all of them.
- A device scores a match only if it has the match's pinned version.
- A minimum-client-version gate applies to new matches, and bundles are never swapped mid-match.
- CI runs the same golden logs against both client and server builds.
- A self-hosted Capacitor live-update channel delivers web-bundle fixes, because sideloaded APKs don't auto-update.
