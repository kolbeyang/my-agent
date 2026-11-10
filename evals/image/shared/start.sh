#!/bin/sh
set -eu
mkdir -p /logs/agent /case/workspace/memory/conversations /case/workspace/memory/reminders
node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync("/case/case.json")); fs.writeFileSync("/case/workspace/memory/MEMORY.md", c.memory)' 
# The real HTTP entry point; no Telegram, SaaS, or shared filesystem.
cd /srv/app
nohup env WORKSPACE_ROOT=/case/workspace HTTP_AUTH_TOKEN=local-eval-token HTTP_PORT=8787 ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" ./node_modules/.bin/tsx src/index.ts --http > /logs/agent/app.log 2>&1 < /dev/null &
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://127.0.0.1:8787/ask; then exit 0; fi
  sleep 1
done
tail -80 /logs/agent/app.log >&2
exit 1
