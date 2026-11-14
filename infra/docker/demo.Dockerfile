# syntax=docker/dockerfile:1
# Free-plan demo (render.yaml): the web app's nginx and the API in one container, because
# Render's free services can't reach each other privately. Production runs them separately
# (web.Dockerfile, api.Dockerfile) with the same nginx config.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@scoresphere/client --filter=@scoresphere/api
RUN pnpm --filter @scoresphere/api deploy --prod --legacy /out

FROM node:24-alpine
ENV NODE_ENV=production API_HOSTPORT=127.0.0.1:3300
RUN apk add --no-cache nginx su-exec \
  && ln -sf /dev/stderr /var/log/nginx/error.log
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /repo/apps/client/dist /usr/share/nginx/html
COPY infra/docker/web.nginx.conf.template /etc/nginx/templates/default.conf.template
COPY infra/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY infra/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint
COPY infra/docker/demo-start.sh /usr/local/bin/demo-start
EXPOSE 8080
CMD ["demo-start"]
