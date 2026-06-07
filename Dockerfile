# ---- Stage 1: build the React/Vite SPA with pnpm ----
FROM node:22-alpine AS web-build
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm -F @leetete/web build


# ---- Stage 2: Python runtime ----
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=3000 \
    STATIC_DIR=/app/public

# Install uv (faster than pip for resolution + install)
RUN pip install --no-cache-dir uv==0.5.4

WORKDIR /app/apps/api

# Install Python dependencies into the system interpreter
COPY apps/api/pyproject.toml ./
RUN uv pip install --system --no-cache .

# Copy app source
COPY apps/api/app ./app

# Copy built web static assets from stage 1
COPY --from=web-build /app/apps/web/dist /app/public

EXPOSE 3000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3000", "--proxy-headers", "--forwarded-allow-ips=*"]
