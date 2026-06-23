#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:-homelab}"
ssh "$HOST" 'bash ~/my-agent/scripts/deploy-remote.sh'
