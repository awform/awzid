# syntax=docker/dockerfile:1
# Images de production AWFORM (une construction, quatre cibles) : api, worker, web, relay (relais d'école).
# Construction :  docker compose -f infra/prod/compose.yml build
# Aucun secret dans les images : tout vient du fichier d'environnement de l'hôte au démarrage.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable
WORKDIR /src

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm -r build
# paquets autonomes (dépendances de production seulement)
RUN pnpm --filter @awform/api deploy --prod --legacy /out/api \
 && pnpm --filter @awform/worker deploy --prod --legacy /out/worker \
 && pnpm --filter @awform/web deploy --prod --legacy /out/web \
 && pnpm --filter @awform/relay deploy --prod --legacy /out/relay \
 && rm -rf /out/web/src /out/web/e2e /out/web/.svelte-kit

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production TZ=Europe/Paris
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
USER node

FROM runtime AS api
COPY --from=build --chown=node:node /out/api /app
ENV API_HOST=0.0.0.0 API_PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

FROM runtime AS worker
COPY --from=build --chown=node:node /out/worker /app
CMD ["node", "dist/index.js"]

FROM runtime AS web
COPY --from=build --chown=node:node /out/web /app
ENV HOST=0.0.0.0 PORT=3000 PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=x-forwarded-host ADDRESS_HEADER=x-forwarded-for XFF_DEPTH=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build/index.js"]

# relais d'école (lot 17) : mini-PC ou Raspberry Pi (amd64 ou arm64), données dans /data (volume)
FROM runtime AS relay
COPY --from=build --chown=node:node /out/relay /app
ENV HOST=0.0.0.0 PORT=3000 AWFORM_RELAIS_DONNEES=/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/relais/etat.json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
