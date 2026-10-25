FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile

COPY assets/telegram assets/telegram
COPY apps/api apps/api
RUN pnpm --filter @lingvoteka/api db:generate \
  && pnpm --filter @lingvoteka/api build

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@lingvoteka/api", "start"]
