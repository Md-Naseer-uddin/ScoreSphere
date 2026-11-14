#!/bin/sh
# Free-plan demo: migrate, start nginx (port 8080) in the background, then run the API in the
# foreground, so the container stops, and the host restarts it, if the API stops.
set -e
sed "s|\${API_HOSTPORT}|${API_HOSTPORT}|" /etc/nginx/templates/default.conf.template \
  > /etc/nginx/http.d/default.conf
api-entrypoint node dist/migrate.js
nginx
# The host's PORT is nginx's; the API listens on the port nginx proxies to.
export PORT="${API_HOSTPORT##*:}"
exec api-entrypoint node dist/main.js
