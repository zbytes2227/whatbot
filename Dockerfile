FROM node:20-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  fonts-liberation \
  gosu \
  tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/.next/standalone ./
COPY --from=build /usr/src/app/.next/static ./.next/static
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /usr/src/app/whatsapp-sessions /usr/src/app/logs \
  && chmod +x /usr/src/app/docker-entrypoint.sh

USER root

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/src/app/docker-entrypoint.sh", "node", "server.js"]
