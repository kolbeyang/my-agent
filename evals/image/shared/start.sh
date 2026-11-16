#!/usr/bin/env bash
set -euo pipefail
mkdir -p /logs/agent
cd /srv/app
export WORKSPACE_ROOT=/case/workspace
export HTTP_AUTH_TOKEN=local-eval-only-secret
export HTTP_PORT=8787
# Keep the real process running across Harbor exec calls.
nohup ./node_modules/.bin/tsx src/index.ts --http > /logs/agent/server.log 2>&1 < /dev/null &
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://127.0.0.1:8787/not-found; then exit 0; fi
  sleep 1
done
tail -100 /logs/agent/server.log >&2
exit 1
