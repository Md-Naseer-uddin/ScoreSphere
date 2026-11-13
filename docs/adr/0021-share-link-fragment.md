# ADR 0021: Share links move to the URL fragment

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D21](../../plan.md)

## Decision and rationale

- `/live/:token` becomes `/live#<token>`. The fragment never appears in requests, `Referer` headers or server logs.
- The client sends the token in a header, and responses set `Referrer-Policy: no-referrer`.
- Public endpoints are rate-limited, with an optional broadcast delay, because ball-by-ball feeds of local cricket get scraped for betting.
