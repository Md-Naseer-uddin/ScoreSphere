#!/bin/sh
# Starts as root only to make the media folder writable (a mounted disk or new volume may be
# owned by root), then runs the command as the unprivileged `node` user.
set -e
if [ "$(id -u)" = '0' ]; then
  dir="${STORAGE_DIR:-.storage}"
  mkdir -p "$dir"
  chown node:node "$dir"
  exec su-exec node "$@"
fi
exec "$@"
