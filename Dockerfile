FROM node:24-slim

# Build tools for better-sqlite3 (Mem0's history store) native compile
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# Long-polling Telegram worker — no inbound port needed
CMD ["pnpm", "run", "start:prod"]
