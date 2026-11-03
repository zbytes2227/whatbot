FROM node:24-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  gosu \
  tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

FROM base AS deps
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM base AS build
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Must match the volume mount; the app cannot write elsewhere as `node`.
ENV WHATSAPP_SESSION_PATH=/usr/src/app/whatsapp-sessions

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/.next/standalone ./
COPY --from=build /usr/src/app/.next/static ./.next/static
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /usr/src/app/whatsapp-sessions /usr/src/app/logs /usr/src/app/.next/cache \
  && chown -R node:node /usr/src/app/.next /usr/src/app/whatsapp-sessions /usr/src/app/logs \
  && chmod +x /usr/src/app/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The entrypoint fixes volume ownership as root, then drops to the `node` user.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/src/app/docker-entrypoint.sh", "node", "server.js"]
