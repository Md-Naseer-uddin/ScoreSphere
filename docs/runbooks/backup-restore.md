# Backup and restore drill

## Nightly backup

`infra/scripts/backup.sh` writes a compressed custom-format dump and checks it can be read:

```sh
DATABASE_URL=postgres://... BACKUP_DIR=/backups infra/scripts/backup.sh
```

- Run it nightly (cron or the host's scheduler) and copy the dump to storage in another
  location. Uploaded media (`STORAGE_DIR`) needs the same treatment.
- Keep 14 daily and 8 weekly dumps; set this as a lifecycle rule on the backup storage.
- A managed Postgres with point-in-time recovery is better still; keep the nightly dump as
  an independent copy.

## Monthly restore drill

A backup nobody has restored is a hope, not a backup.

1. Create an empty scratch database (never the production one).
2. Restore the latest dump:
   ```sh
   TARGET_DATABASE_URL=postgres://.../scoresphere_restore infra/scripts/restore.sh /backups/scoresphere-<time>.dump
   ```
3. Compare the printed counts (users, matches, events) with production at backup time.
4. Point a staging API at the restored database and open one recent match: its scorecard
   must match production.
5. Record the date, dump name, duration and any problems in the ops log; drop the scratch
   database.

## Recovering production

1. Stop the API so nothing writes during the restore.
2. Restore the newest good dump into a new database, check it as in the drill, then switch
   `DATABASE_URL` to it.
3. Events scored after the backup are still on the scoring devices. When a scoring device
   opens one of its matches online, it checks the server's copy; if the server is behind (or
   no longer has the match), the device queues the missing events and sends them again with
   the same IDs. Ask scorers who played since the backup time to open their matches while
   online. Matches handed over to another device since then can only be recovered from that
   device.
