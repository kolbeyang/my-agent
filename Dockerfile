FROM node:24-slim

# git: general-purpose tool available to the agent's bash shell (local use only;
# there is no remote memory sync — back up DATA_DIR out-of-band if you need it).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# Long-polling Telegram worker — no inbound port needed
CMD ["pnpm", "run", "start:prod"]
