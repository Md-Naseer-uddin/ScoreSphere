# syntax=docker/dockerfile:1
# ScoreSphere web app (PWA): a static build served by nginx with strict headers.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
ARG VITE_API_URL=/api/v1
ARG VITE_PUBLIC_APP_URL
ENV VITE_API_URL=$VITE_API_URL VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@scoresphere/client

FROM nginx:1.29-alpine
COPY infra/docker/web.nginx.conf.template /etc/nginx/templates/default.conf.template
COPY infra/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/client/dist /usr/share/nginx/html
# The API is proxied under /api, so app and API share an origin (first-party refresh cookie).
# API_UPSTREAM is substituted into the nginx config at start.
ENV API_UPSTREAM=http://api:3300
EXPOSE 8080
