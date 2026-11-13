# ADR 0025: Phone numbers are not verified for now

- **Status:** Accepted (owner decision)
- **Date:** 2026-11-14
- **Source:** [plan.md §2.2 D25](../../plan.md)

## Decision and rationale

- Registration accepts any valid 10-digit Indian mobile number (starts with 6–9, checked with libphonenumber-js). It is stored as E.164 (`+91…`) and must be unique.
- There is no OTP, no SMS provider and no DLT registration.
- Without verification nobody can prove they own a number. The plan covers the gaps this opens:
  - **Password recovery.** A one-time recovery code is shown at registration for the user to save. An optional email address with a verified reset link is a second route. Otherwise, reset is done by support.
  - **Number squatting.** Someone can register a number that isn't theirs and lock the real owner out. Registration is rate-limited per IP and device, and a "this is my number" report goes to support.
  - **Profile claims.** Whoever registers a number could claim the pending player added under it. A claim therefore needs the user's confirmation (D13) **and** approval from an admin of each workspace that added that player. Admins can unlink a claim.
  - **Phone change** needs the current password, must keep the number unique, and is audited.
  - **Invites** go out as a link through the native share sheet (WhatsApp and similar), not SMS.
- Verification can be added later without migrating existing data:
  - `phone_identities.verified_at` stays null for now;
  - an `OtpProvider` interface is reserved;
  - D14 describes the challenge table.
  - Once verification ships, a verified owner wins: any unverified account holding that number is asked to change it.
