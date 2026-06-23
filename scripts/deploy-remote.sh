#!/usr/bin/env bash
# Runs ON the deploy host (invoked by scripts/deploy.sh over SSH).
# Converges to origin/main, reinstalls deps, restarts the service. No sudo.
set -euo pipefail

# Lets `systemctl --user` reach the user bus in a non-interactive SSH shell.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

cd "$HOME/my-agent"
git fetch -q origin && git reset --hard origin/main
pnpm install --frozen-lockfile
systemctl --user restart my-agent
echo "✅ deployed $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
