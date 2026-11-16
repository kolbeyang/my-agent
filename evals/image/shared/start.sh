#!/usr/bin/env bash
set -euo pipefail
mkdir -p /logs/agent
cd /srv/app
export WORKSPACE_ROOT=/case/workspace
export HTTP_AUTH_TOKEN=local-eval-only-secret
export HTTP_PORT=8787
# Capture SDK spans into the Harbor trial instead of exporting to production.
# Laminar's trajectory-file mode needs no project API key in the container.
export LMNR_TRAJECTORY_PATH=/logs/agent/trajectory.json
# Keep the real process running across Harbor exec calls.
nohup ./node_modules/.bin/tsx src/index.ts --http > /logs/agent/server.log 2>&1 < /dev/null &
app_pid=$!
for i in $(seq 1 60); do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    tail -100 /logs/agent/server.log >&2
    exit 1
  fi
  if curl -s -o /dev/null http://127.0.0.1:8787/not-found; then exit 0; fi
  sleep 1
done
tail -100 /logs/agent/server.log >&2
exit 1
