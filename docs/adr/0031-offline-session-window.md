# ADR 0031: The last signed-in account stays usable offline for 14 days

- **Status:** Accepted
- **Date:** 2026-11-14
- **Source:** plan §7 open decision "Offline scoring window" (proposed default adopted), ADR 0020

## Decision and rationale

- After each successful sign-in or refresh, the device remembers the account (ID and display name) and the time.
- If the app starts with no connection, it continues as that account, using only data already on the device. It does so only if the last confirmation was within 14 days.
- Without a remembered account, or after 14 days, the app shows the "You're offline" screen.
- Signing out, or a refused refresh token, forgets the account at once.
- When the connection returns, the app refreshes the session; scoring events then sync.
- Why:
  - Offline scoring must survive the app being reloaded or killed at the ground.
  - The access token lives in memory only, so it is gone after a reload. Without this rule a reload offline would lock the scorer out of a match in progress.
  - The window bounds how long a device that was signed out elsewhere, or lost, can keep showing that account's local data.
- The window is one constant (`OFFLINE_WINDOW_MS`), so it can change without touching anything else.
