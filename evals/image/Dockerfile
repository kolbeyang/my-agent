FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-yaml sqlite3 curl bash tar gzip && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /srv/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY src/ ./src/
COPY evals/image/shared/ /opt/harness/
WORKDIR /case
