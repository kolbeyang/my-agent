#!/usr/bin/env bash
set -euo pipefail
mkdir -p /logs/agent
cd /srv/app
export WORKSPACE_ROOT=/case/workspace
export HTTP_AUTH_TOKEN=local-eval-only-secret
export HTTP_PORT=8787
# Remote trials strip LMNR_* credentials. This SDK requires tracing config at
# startup but predates Harbor trajectory-file support; route its exporter to a
# loopback endpoint instead of sending eval spans to the production project.
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
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
