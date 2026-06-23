#!/usr/bin/env bash
# One-time host setup. Needs sudo once (linger). Idempotent — safe to re-run.
# Prereq: Node installed system-wide + .env populated (see DEPLOY.md).
set -euo pipefail

export XDG_RUNTIME_DIR="/run/user/$(id -u)"

cd "$HOME/my-agent"
pnpm install --frozen-lockfile

# Install the user unit and run it at boot without a login.
mkdir -p "$HOME/.config/systemd/user"
cp deploy/my-agent.service "$HOME/.config/systemd/user/my-agent.service"
systemctl --user daemon-reload
sudo loginctl enable-linger "$USER"
systemctl --user enable my-agent
systemctl --user restart my-agent

sleep 2
systemctl --user --no-pager status my-agent | head -n 8
