FROM node:24-slim

# git + ssh client: the agent runs git itself to sync its data dir to a private repo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git openssh-client \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# Long-polling Telegram worker — no inbound port needed
CMD ["pnpm", "run", "start:prod"]
