# Phone Identity, User Profiles, Registered Players and Guests

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0010](../adr/0010-global-persons-roster-members.md), [0011](../adr/0011-participant-kinds.md), [0012](../adr/0012-phone-lookup-privacy.md), [0013](../adr/0013-claim-confirmation.md), [0014](../adr/0014-otp-challenges-deferred.md), [0025](../adr/0025-phone-verification-deferred.md), [0026](../adr/0026-adult-accounts-only.md) (no phone verification, lookup responses, claim approval, roster members, minors). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

## 1. Account login decision

The required login identifier is a **unique verified mobile phone number**, replacing email as the primary identity. Password remains required. Email is optional and may be used for secondary communication or recovery only after verification.

### India-first number format

- Registration UI: country selector default `+91`, followed by a 10-digit mobile number.
- Backend storage: canonical E.164 string, e.g. `+919876543210`.
- Use a phone parsing/normalization library; do not build validation from a simple regex alone.
- Store as `varchar`, not `bigint`, because phone numbers are identifiers, not quantities.
- If international support is added, the UI may accept other country codes while keeping the same E.164 storage contract.

### Registration flow

1. User enters phone number.
2. Backend normalizes number and creates OTP challenge.
3. User verifies OTP.
4. User enters display name and password.
5. Backend transaction claims the phone identity and creates the account/workspace/profile links.
6. User logs in with phone + password on subsequent sessions.

Require OTP verification for registration and phone-number changes. Password login should not necessarily require an OTP on every sign-in; use risk-based step-up verification for new devices or suspicious activity. Account recovery must prove control of the verified phone (and optionally verified email if present).

## 2. Phone identity model

Use a `phone_identities` registry with a globally unique `phone_e164`. A `users` account references one identity. A reusable registered `players` profile can reference the same identity and link to the corresponding user. A pending player profile can reserve a phone identity before the person creates an account.

This avoids the common data problem where a team has a player record and later signup creates an unrelated user with the same number.

Do not treat an unverified number entered by another user as proof of ownership. It is only a pending invitation/claim target until the person verifies it themselves.

## 3. User profile

### Required
- Verified phone number.
- Password hash.
- Display name.
- Account status.

### Optional
- Profile picture/avatar.
- Full name (if different from display name).
- Email address and verification state.
- Date of birth (only if product needs age-based features; define minor/guardian policy first).
- Preferred language.
- City/region.
- Bio.
- Discoverability-by-phone setting.

### Profile picture
- Upload to object storage using an authorized signed upload flow.
- Validate file type and size on server; do not trust extension or client MIME.
- Generate safe thumbnail variants.
- Store only object keys/metadata in PostgreSQL.
- Provide default avatar when no image exists.

### Privacy settings
- `discoverable_by_phone` defaults to **false**.
- Profile display name/avatar may be returned in phone lookup only if the user has enabled discoverability or accepted a prior invitation.
- Never expose email, full phone, date of birth, team history or private statistics from a phone lookup.
- Provide block/report and phone-visibility controls if social discovery grows.

## 4. Team member add flow: two explicit options

When adding team members, UI presents two actions:

### Option A — Guest

Purpose: add someone who does not need an app account or global identity.

Fields may include:
- Display name (required).
- Jersey number (optional).
- Sport role/position (optional).
- Avatar/initials (optional; local only).

Rules:
- Do not ask for phone number.
- Do not search the global user directory.
- Store the reusable guest profile only on the device of the user who created it, in IndexedDB/SQLite.
- Guest profile can be reused on that device in later teams/matches.
- Do not sync the guest's reusable profile or phone/contact details to PostgreSQL.
- If the guest participates in a match that is synchronized or shared, store only a minimal immutable participant snapshot (e.g. display name, jersey number and sport role) needed to render the scorecard. This snapshot is not a registered player profile and cannot be searched globally.
- If device data is cleared or the device is lost, the reusable guest profile may be lost. Explain this in the UI.

### Option B — Player

Purpose: add a person by their verified/account phone identity so their profile can be linked across devices and teams.

UI flow:
1. User enters the player's 10-digit phone number.
2. Client normalizes and submits the exact number to an authenticated, rate-limited lookup endpoint.
3. Backend returns one of:
   - `REGISTERED_DISCOVERABLE`: minimal profile card (display name/avatar) and Add action.
   - `REGISTERED_NOT_DISCOVERABLE`: do not expose profile details; offer an invitation/association request flow.
   - `PENDING_CLAIM`: a pending player identity exists; allow authorized workspace owner to edit/resend invitation, without creating another profile.
   - `NO_ACCOUNT`: ask for player name and confirm phone, then create a pending claimable player profile.
4. If `NO_ACCOUNT`, backend creates `phone_identity` in `PENDING_CLAIM` state and a `players` row with display name and phone identity. Optionally send an invitation SMS through a provider adapter, subject to consent and provider availability.
5. When the person later registers, they must verify control of the exact same phone number.
6. During the registration transaction, backend finds the pending identity/player and links it to the newly created user. The player profile is retained; do not create a duplicate player row.
7. If an account already exists, adding it to a team creates/uses the player's linked profile; it does not create another user.

## 5. Registration/account-claim edge cases

- Phone exists on a pending player record, no account: verified signup claims the record.
- Phone exists on a registered user: add existing player profile; never create second account.
- Phone exists but profile not discoverable: do not reveal identity details; use an invite/request path.
- Two workspace members try to create pending player with same phone: unique constraint returns existing pending identity and prevents duplicates. Allow authorized reuse/association only after confirmation/consent.
- Wrong phone entered: creator can correct/remove the pending record; only the phone owner can claim it by OTP.
- Account changes phone: verify new phone, check uniqueness, preserve old player linkage, update phone identity atomically; keep a security audit.
- Phone number reassigned by carrier: do not silently transfer a historical profile. Require a controlled recovery/verification process and consider account recovery cooldown/support for disputed ownership.
- User requests account deletion: retain or anonymize historical participant snapshots according to retention policy; detach/anonymize profile without corrupting match records.

## 6. Privacy and anti-enumeration

Phone lookup is a sensitive directory feature. It must not become a public endpoint that allows harvesting registered phone numbers.

Controls:
- Authenticated workspace member only.
- Exact normalized phone lookup; no prefix search.
- Rate limit per user, device and IP.
- Generic responses for registration/recovery flows.
- `discoverable_by_phone=false` by default.
- Do not return full phone number; mask it in UI.
- Audit lookups and invitation/association actions without logging raw phone in ordinary application logs.
- Optional user confirmation/acceptance for joining an organization/team, particularly where their profile/records are shared.

## 7. Data model summary

- `phone_identities`: unique normalized phone and verification/claim status.
- `users`: authentication account; references phone identity.
- `players`: reusable player identity; may link to phone identity and a user account.
- `teams` + `team_memberships`: workspace-owned rosters.
- Device-local `guest_profiles` + `local_team_guest_memberships`: local-only reusable guest data.
- `match_side_participants`: immutable match participant snapshot for both registered and guest participants.

## 8. Acceptance criteria

1. Two accounts cannot register with the same verified phone identity.
2. Phone cannot be changed without proving control of the new number.
3. Team add UI explicitly distinguishes Guest and Player.
4. Guest flow performs no phone lookup and persists only locally.
5. Player flow searches exact phone and returns only privacy-permitted profile data.
6. A non-registered player can be created with name + phone as pending claim.
7. When the pending player verifies/registers using that phone, the existing player identity is linked to the new user.
8. No duplicate user/player profile is created during claim.
9. Match scorecards remain readable after guest data is no longer on the originating device, using only the match snapshot.
