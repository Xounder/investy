FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @investy/domain build && pnpm --filter @investy/api build && pnpm --filter @investy/web build

FROM node:22-alpine AS api
WORKDIR /app/apps/api
COPY --from=builder /app /app
RUN mkdir -p /app/.data/backups && chown -R node:node /app/.data
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

# Native Ubuntu dependencies and bundled browsers must match Playwright 1.60.0.
# Keep this separate from the Alpine application builder (native addons differ).
FROM mcr.microsoft.com/playwright:v1.60.0-noble AS e2e
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN npm install --global pnpm@10.4.1 && pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @investy/domain build && pnpm --filter @investy/api build && pnpm --filter @investy/web build
WORKDIR /app/apps/web
ENV CI=1
CMD ["node", "/app/docker/run-e2e.js", "test"]
