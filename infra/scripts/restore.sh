#!/usr/bin/env bash
# Restores a dump into an EMPTY database (the restore drill uses a scratch one).
# Usage: TARGET_DATABASE_URL=postgres://.../scoresphere_restore infra/scripts/restore.sh backups/scoresphere-....dump
set -euo pipefail
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL to an empty database}"
dump="${1:?pass the dump file}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET_DATABASE_URL" "$dump"
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "select (select count(*) from users) as users, (select count(*) from matches) as matches, (select count(*) from match_events) as events;"
echo "Restore complete. Compare these counts with production before signing off the drill."
