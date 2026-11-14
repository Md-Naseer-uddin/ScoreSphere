# Lost or stolen device

**Notice:** a scorer reports a lost phone, or a workspace admin sees an unknown device.

## The user can act themselves

From another device: sign in, open **Profile → Devices** and sign the lost device out.
Its refresh token is revoked at once; its access token expires within 15 minutes.

## If a match was being scored on it

1. On another device, open the match and choose **Score on this device**, then **Take over**.
   The lease moves and its epoch goes up (ADR 0007).
2. Anything the lost device scored but never synced is lost with it. If it ever comes back
   online, its late events are refused and kept for review (`match_event_rejections`); they
   never change the match.

## If the account may be compromised

1. The user changes their password (all other sessions can then be signed out from Devices).
2. If they can't sign in, they reset with their recovery code from the sign-in page.
3. Check the audit log for role changes or invitations made from the lost device:
   `select action, created_at from audit_logs where actor_user_id = '<id>' order by created_at desc;`
