# syntax=docker/dockerfile:1
# ScoreSphere API: build the workspace, then ship only the API with production dependencies.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@scoresphere/api
RUN pnpm --filter @scoresphere/api deploy --prod --legacy /out

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3300/api/v1/health || exit 1
CMD ["node", "dist/main.js"]
