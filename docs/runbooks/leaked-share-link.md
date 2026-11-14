# Leaked share link

**Notice:** a scorer reports a live link being passed around (for example, to a betting
group), or `scoresphere_sse_connections` jumps for one match.

1. A scorer opens the match, goes to **Live link** and taps **Revoke**. Open streams close
   with a "link not available" message within seconds; the link stops working at once.
2. If spectators still need a link, create a new one with an expiry (24 hours).
3. Tokens are stored only as hashes and travel in the URL fragment and a header, never in
   server logs or `Referer` (ADR 0021), so revoking is enough; there is nothing to purge.
4. If scraping continues through new links, rate limits apply per IP on `/public/live`.
   Lower them for that deployment, and consider a broadcast delay (plan §7, not built yet).

To revoke on a user's behalf (support):

```sql
update match_share_links set revoked_at = now() where match_id = '<match id>' and revoked_at is null;
select pg_notify('match_updates', json_build_object('matchId', '<match id>', 'version', 0)::text);
```
