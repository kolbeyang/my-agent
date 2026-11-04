#!/usr/bin/env bash
# e2e: executable edit
set -euo pipefail

HOST="${DEPLOY_HOST:-homelab}"
ssh "$HOST" 'bash ~/my-agent/scripts/deploy-remote.sh'
