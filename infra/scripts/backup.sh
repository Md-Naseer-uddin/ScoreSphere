#!/usr/bin/env bash
# Nightly logical backup: a compressed custom-format dump.
# Usage: DATABASE_URL=postgres://... BACKUP_DIR=/backups infra/scripts/backup.sh
# Retention (deleting old dumps) is the job of the backup storage's lifecycle rules.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/scoresphere-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$file.partial"
mv "$file.partial" "$file"
# A dump that can't be listed is not a backup.
pg_restore --list "$file" > /dev/null
echo "Backup written: $file"
