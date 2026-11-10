FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl python3 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /srv/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY src/ ./src/
COPY tsconfig.json ./
COPY evals/image/shared/ /opt/harness/
WORKDIR /case
