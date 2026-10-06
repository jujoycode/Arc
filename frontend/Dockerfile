# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /source/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN --mount=type=secret,id=proxy_ca --mount=type=cache,target=/root/.local/share/pnpm/store \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global pnpm@11.19.0 && pnpm install --frozen-lockfile
COPY frontend/ ./
COPY scripts/check_frontend_boundaries.mjs /source/scripts/check_frontend_boundaries.mjs
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY --chmod=644 frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /source/frontend/dist/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD wget -Y off -q -O - http://127.0.0.1:8080/healthz >/dev/null || exit 1
