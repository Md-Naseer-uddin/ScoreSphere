# ADR 0003: Client storage: IndexedDB (web) + SQLite (Android) → Dexie/IndexedDB on both

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D3](../../plan.md)

## Decision and rationale

- Two engines mean two schemas, two migration paths and two transaction semantics, all for the most safety-critical code.
- On Capacitor Android, WebView IndexedDB lives in app-private storage and isn't evicted. The usual reason for SQLite is iOS WKWebView, which is not a target.
- Keep a thin `LocalStore` interface so native SQLite can be added if measurement ever demands it.
- Hard rule: never change Capacitor's scheme or hostname after release. Changing the origin wipes local data.
