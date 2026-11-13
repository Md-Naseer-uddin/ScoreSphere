# ADR 0027: The Android APK is built in GitHub Actions

- **Status:** Accepted (owner decision)
- **Date:** 2026-11-14
- **Source:** [plan.md §1](../../plan.md)

## Decision and rationale

- CI builds the Capacitor Android debug APK on every push to `main` and uploads it as a workflow artifact for sideloading.
- No Android SDK is needed on developer machines. Capacitor needs JDK 21, which the CI runner provides.
- Release signing (M6) also runs in CI, with the keystore held in repository secrets. The keystore is never committed.
