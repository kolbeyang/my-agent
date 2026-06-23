# Deploying

The bot runs on a Linux host as a **rootless systemd user service**. GitHub `main`
is the source of truth; the host converges to it on every deploy. `.env` and the
agent's workspace (`WORKSPACE_ROOT`, which holds `memory/`) live only on the host
(gitignored) and are never touched by a deploy.

The host is referenced only by an SSH alias (default `homelab`) — the actual address
and user live in your local `~/.ssh/config`, never in this repo:

```
# ~/.ssh/config
Host homelab
    HostName <ip-or-dns>
    User <you>
```

## Everyday deploy (from your dev machine)

```bash
git push                  # ship your changes to origin/main
./scripts/deploy.sh       # roll them out to the host
```

`deploy.sh` SSHes in and runs `scripts/deploy-remote.sh`:
`git reset --hard origin/main` → `pnpm install --frozen-lockfile` →
`systemctl --user restart my-agent`. **No sudo.** Override the target with
`DEPLOY_HOST=user@host ./scripts/deploy.sh`.

## One-time host setup

Prereqs on the host: `git`, `curl`, the repo cloned to `~/my-agent`, a populated `.env`,
and **Node installed system-wide** at the `.node-version` version. Install Node:

```bash
cd /tmp && curl -fsSLO https://nodejs.org/dist/v24.17.0/node-v24.17.0-linux-x64.tar.xz
sudo tar -xJf node-v24.17.0-linux-x64.tar.xz -C /usr/local --strip-components=1
sudo corepack enable
```

Then, from an SSH session on the host:

```bash
cd ~/my-agent && git fetch origin && git reset --hard origin/main
bash ~/my-agent/scripts/bootstrap-remote.sh
```

`bootstrap-remote.sh` installs the user unit (`deploy/my-agent.service`), enables linger
so it runs at boot, and starts it. It needs **sudo once** (for `loginctl enable-linger`).

## Ops (on the host)

```bash
systemctl --user status my-agent
journalctl --user -u my-agent -f       # live logs
systemctl --user restart my-agent
```
