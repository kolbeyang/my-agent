# my-agent

A minimal personal-assistant Telegram bot named **Sam**, built on the
[Vercel AI SDK](https://sdk.vercel.ai). Single-user, runs as a long-poll worker.

- **Inference** — `moonshotai/kimi-k2` via the **Vercel AI Gateway** (one API key for everything).
- **Memory** — a plain directory on disk (`memory/`). `MEMORY.md` is the hot tier, auto-injected
  into the system prompt every turn; `memory/notes/` is the cold tier the agent greps on demand.
  The agent maintains both itself with its file tools. No database.
- **Tools** — `bash` (a real shell rooted at the workspace), `readFile`/`writeFile`,
  **Tavily** web search, and **Gmail + Calendar + Sheets** via
  [Composio](https://composio.dev) (curated read / draft / create only — never sends or deletes).
- **Reminders** — one YAML file per reminder in `memory/reminders/`, scheduled with
  [croner](https://github.com/hexagon/croner). Rebuilt from disk on boot and after every turn.

## Quick start

```bash
corepack enable                 # pnpm 10 (pinned in package.json)
pnpm install
cp .env.example .env            # fill in keys — see the table below
pnpm try                        # CLI REPL: type messages, "exit" to quit
```

`pnpm try` runs the full agent in a terminal REPL against a local `./workspace` — the fastest
way to poke at it. To run the actual Telegram bot (long-polling):

```bash
pnpm dev                        # needs TELEGRAM_TOKEN + TELEGRAM_CHAT_ID
```

**Requirements:** Node 24 (`.node-version`) and pnpm 10 (`corepack enable`).

## Environment variables

Copy `.env.example` to `.env` and fill these in. Leave a feature's keys unset and that feature is
simply skipped, so you can start with just `AI_GATEWAY_API_KEY` (+ `TELEGRAM_*` for the bot).

| Var | Required? | What it's for |
|---|---|---|
| `AI_GATEWAY_API_KEY` | **yes** | All inference, via [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). |
| `LMNR_PROJECT_API_KEY` | for tracing | Laminar project key; if unset, tracing is skipped. |
| `LMNR_BASE_URL` | no | Override the Laminar endpoint (e.g. self-hosted); defaults to Laminar Cloud. |
| `LMNR_OTLP_HTTP` | no | Set to `true` for OTLP/HTTP instead of the default gRPC, e.g. for a local collector. |
| `TELEGRAM_TOKEN` | for Telegram | Bot token from [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_CHAT_ID` | for Telegram | Your chat id — the single-user gate. From [@userinfobot](https://t.me/userinfobot). |
| `WORKSPACE_ROOT` | no | The agent's bash cwd + file-tool root. Default `./workspace`. |
| `MEMORY_ROOT` | no | The memory dir, relative to `WORKSPACE_ROOT`. Default `memory`. |
| `TAVILY_API_KEY` | for web search | From [tavily.com](https://tavily.com). |
| `COMPOSIO_API_KEY` + `COMPOSIO_USER_ID` | for Gmail/Cal/Sheets | Both must be set; the Google account is connected under that Composio user. |

## Laminar tracing

Install dependencies and set `LMNR_PROJECT_API_KEY` in your private `.env` (never commit
keys). Startup registers the [AI SDK v7 Laminar telemetry](https://laminar.sh/docs/integrations/vercel-ai-sdk)
once before the first turn. Each serialized turn has an `agent.turn` parent span,
including the streamed model calls and tool activity. Prompts and replies are
captured by default, so only enable tracing where that data may be exported.
The CLI drains pending spans before exit; long-running Telegram/HTTP channels use
background batching. If no Laminar key is set, Telegram/HTTP/CLI still work
without Laminar export. For a self-hosted or local collector, set `LMNR_BASE_URL`
to its base URL (including port); set `LMNR_OTLP_HTTP=true` for OTLP/HTTP.
A key for a local Laminar project is not necessarily valid for Laminar Cloud.

## How it works

```
Telegram / CLI ──► channel ──► agent.runTurn ──► generateText (Vercel AI SDK, via AI Gateway)
                                   │               tools: bash, readFile, writeFile,
                                   │                      web_search, web_extract, Composio
                                   ├─ workspace = WORKSPACE_ROOT (bash cwd + file root)
                                   ├─ memory    = WORKSPACE_ROOT/memory (notes, conversations, reminders)
                                   └─ reminders = YAML in memory/reminders, scheduled by croner
```

Turns are mutex-serialized so a turn and a firing reminder never overlap. Conversation history is
logged as per-day JSON files under `memory/conversations`; the model sees the most recent 25 messages.

## Scripts

| Command | What |
|---|---|
| `pnpm try` | Local CLI REPL (best for testing). |
| `pnpm dev` | Telegram bot with `--watch` (auto-reload). |
| `pnpm start` | Telegram bot, no watch. |

## Deploying

Runs on a self-hosted Linux host as a rootless **systemd** user service (long-polls Telegram, no
public port). GitHub `main` is the source of truth; the host converges to it on every deploy.
`.env` and the workspace live only on the host (gitignored) and are never touched by a deploy.

The host is referenced only by an SSH alias (default `homelab`) defined in your local
`~/.ssh/config` — nothing hardware-specific is committed.

```bash
git push                  # ship changes to origin/main
./scripts/deploy.sh       # SSH in, git reset --hard, pnpm install, restart the service
```

One-time host setup is `scripts/bootstrap-remote.sh` (installs the user unit, enables linger so it
runs at boot). Ops on the host:

```bash
systemctl --user status my-agent
journalctl --user -u my-agent -f       # live logs
```

See [`CLAUDE.md`](./CLAUDE.md) for the architecture deep-dive, key gotchas, and the full ops runbook.
