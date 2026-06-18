# my-agent — personal-assistant Telegram bot

A minimal personal assistant named **Harry**: a Telegram bot (grammY) on the Vercel
AI SDK, with a **plain-filesystem long-term memory**, Gmail + Google Calendar
tools (Composio), web search (Tavily), self-scheduled reminders, and tracing (Laminar).
All LLM inference runs through the Vercel AI Gateway on a single key. Deployed on Fly.io.

Telegram bot: **@your_bot** (single-user — gated to one chat id).

## Architecture (`src/`, modular)

```
Telegram / CLI ──► channel ──► agent.runTurn ──► generateText (Vercel AI SDK)
                                  │                model: google/gemini-3.5-flash via AI Gateway
                                  │                tools: bash, readFile, writeFile,
                                  │                       web_search, web_extract, Composio (Gmail/Cal)
                                  │                tracing: Laminar (getTracer)
                                  ├─ memory = the DATA_DIR filesystem; the agent
                                  │           reads/writes/greps it itself via the bash + file tools
                                  └─ reminders = YAML files in DATA_DIR/reminders, scheduled by croner
```

Two run modes via `--mode`: `telegram` (long-polling worker) and `cli` (local REPL).

### File map (`src/`)
- **`index.ts`** — entrypoint. Laminar init, creates `DATA_DIR` subdirs, then dispatches to
  the channel named by `--mode`.
- **`agent.ts`** — `createAgent(deliver)` factory. `runTurn` (one `generateText` call,
  mutex-serialized so turns/reminders never overlap) and `syncReminders` (the croner scheduler).
  **The model is set here:** `google/gemini-3.5-flash`.
- **`config.ts`** — single source of truth for on-disk paths: `DATA_DIR` and its
  `conversations/`, `memory/`, `reminders/` subdirs.
- **`conversations.ts`** — transcript log: one JSON file per day under `DATA_DIR/conversations`.
  History window passed to the model = yesterday's + today's files.
- **`prompts.ts`** — assembles the system prompt: reads the static prose from `src/AGENTS.md`
  (`readFileSync` at load), appends the `MEMORY.md` snapshot, then the current date. Also exports
  `REMINDER_PROMPT`.
- **`AGENTS.md`** — the static system-prompt prose (Harry's identity + filesystem/reminders/email
  conventions). Plain markdown, edited without touching code. Lives in `src/` (ships with the
  code; read at runtime by `tsx` — no build step copies it).
- **`types.ts`** — the reminder zod schema (`repeating` cron | `absolute` ISO instant).
- **`channels/`** — delivery surfaces behind a `Channel` interface. `telegram.ts` (grammY
  long-poll), `cli.ts` (REPL), `types.ts` (the interface).
- **`tools/`** — `bash.ts`, `files.ts` (readFile/writeFile), `web.ts` (Tavily-backed
  web_search/web_extract), `composio.ts` (Gmail/Calendar), `util.ts` (output truncation),
  `index.ts` (assembles the toolset, fetching Composio tools once at module load).

### The pieces
- **Model / inference:** `google/gemini-3.5-flash` through the **Vercel AI Gateway**
  (`AI_GATEWAY_API_KEY`) — one key for everything.
- **Memory = the filesystem.** `DATA_DIR` is a plain directory the agent owns. It reads, writes,
  and greps its own notes (`/memory`), reads the chat transcript (`/conversations`), and manages
  reminders (`/reminders`) using the `bash`/`readFile`/`writeFile` tools. There is **no built-in
  backup/sync** — `DATA_DIR` lives on local disk (the Fly volume / the homelab box); if you want
  durability, back it up out-of-band.
  - **Two tiers:** `MEMORY.md` at the root of `DATA_DIR` is the *hot* tier — `prompts.ts`
    auto-injects its contents into the system prompt every turn, so the agent always has its
    key durable facts without searching. `/memory` is the *cold* tier (long tail), grepped on
    demand. The agent maintains `MEMORY.md` itself via `readFile`/`writeFile`.
- **Tools:** `bash` (real shell, cwd = `DATA_DIR`), `readFile`/`writeFile`, `web_search` +
  `web_extract` (Tavily, presented as generic web tools), **Composio** Gmail/Calendar (curated,
  read+draft+create only).
- **Reminders:** one YAML file per reminder in `DATA_DIR/reminders`, scheduled with **croner**.
  Synced on boot and after every turn; only files whose mtime changed are rescheduled.
- **Tracing:** **Laminar** — `Laminar.initialize()` + `tracer: getTracer()` on the AI SDK call.

## Key gotchas (read before changing things)

1. **Laminar needs `tracer: getTracer()`** on every AI SDK call. `initialize()` alone does NOT
   auto-instrument — without the tracer, the dashboard stays empty. `index.ts` also reads
   `LMNR_BASE_URL` / `LMNR_HTTP_PORT` / `LMNR_GRPC_PORT` to point at a **self-hosted** Laminar.
2. **Single-user, gated by `TELEGRAM_CHAT_ID`.** The Telegram channel ignores any chat that
   isn't the owner's id (set once in config, available at boot so reminders deliver after a restart).
3. **Conversation history is per-day JSON files, not an in-memory array.** The model sees
   yesterday + today (`conversations.ts`); files survive restarts. Never write under
   `/conversations` from the agent — it's the read-only transcript.
4. **No built-in memory backup.** `DATA_DIR` is just a directory on local disk — nothing syncs it
   anywhere. If it's lost, the agent's memory is gone. Set up your own backup (the box's local
   cron, a periodic `rsync`/snapshot, etc.) if you want durability.
5. **Composio user id is `<COMPOSIO_USER_ID>`** (`COMPOSIO_USER_ID`) — the Google account is
   connected under that Composio user. Tools are fetched for that id once at module load
   (`tools/composio.ts`); if the keys are unset it returns `{}` and the bot runs without them.
6. **Tool output is capped (`tools/util.ts`, 30k chars/stream).** `bash` tail-truncates and
   spills full output to a temp file whose path it reports; file reads middle-truncate. Default
   bash timeout 120s, max 600s.

## Running locally

```bash
cp .env.example .env     # fill in keys (see below)
pnpm try                 # CLI REPL — type messages, "exit" to quit  (best for testing)
pnpm dev                 # Telegram bot with --watch (needs TELEGRAM_TOKEN + TELEGRAM_CHAT_ID)
```
`pnpm try` runs the full agent against a local `DATA_DIR` (default `./data`) — just a local
folder, nothing synced anywhere.

### Environment variables (`.env`)
| Var | Required | What |
|---|---|---|
| `TELEGRAM_TOKEN` | yes (telegram) | bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | yes (telegram) | your chat id (single-user gate); get it from @userinfobot |
| `AI_GATEWAY_API_KEY` | yes | all inference via Vercel AI Gateway |
| `DATA_DIR` | no | memory/reminders/conversations dir. Default `./data` local, `/data` on Fly (volume) |
| `TAVILY_API_KEY` | for web search | tavily.com |
| `LMNR_PROJECT_API_KEY` | for tracing | Laminar project key |
| `LMNR_BASE_URL` / `LMNR_HTTP_PORT` / `LMNR_GRPC_PORT` | self-hosted Laminar | point tracing at your own Laminar |
| `COMPOSIO_API_KEY` | for Gmail/Cal | composio.dev |
| `COMPOSIO_USER_ID` | for Gmail/Cal | Composio user the Google account is connected under |

## Deploying (Fly.io)

One worker app in region `iad` (no public port, long-polls Telegram) with a persistent volume
for `DATA_DIR`. Config in `fly.toml` (gitignored; `fly.example.toml` is the committed template).
The volume `data` mounts at `/data` and `DATA_DIR=/data`.

> Note: there is no longer a separate Qdrant app — long-term memory is just the filesystem on the
> volume, not a vector DB. (The Fly app may still be named `*-mem0` for historical reasons.)
> The volume is **not** backed up by this app; rely on Fly volume snapshots or your own backup.

```bash
# deploy the bot (most common)
fly deploy -a <your-app> --ha=false

# set / rotate a secret (auto-restarts the machine)
fly secrets set KEY=value -a <your-app>
fly secrets list -a <your-app>
```

Build notes (`Dockerfile`): `node:24-slim` with **git** installed (a general tool for the agent's
bash shell; no remote sync). `package.json` pins `packageManager: pnpm@10.25.0` (newer pnpm
enforces a `minimumReleaseAge` supply-chain policy that fails the build).

## Restarting

```bash
fly apps restart <your-app>          # restart the bot
fly machine restart <id> -a <your-app>
fly status -a <your-app>             # machine state
```
The bot is a worker (no health-checked HTTP service); it stays running 24/7. Restarting reloads
secrets and re-fetches Composio tools at startup. Long-term memory and conversation transcripts
survive (they're on the volume); in-process state (live cron jobs) is rebuilt by `syncReminders`
on boot.

## Debugging

### Logs
```bash
fly logs -a <your-app>               # live tail
fly logs -a <your-app> --no-tail     # recent
```

### Laminar traces (CLI — there is no MCP for Laminar)
The standalone `lmnr-cli` can SQL-query your traces (needs `LMNR_PROJECT_API_KEY` in env):
```bash
set -a; source .env; set +a
npx lmnr-cli@latest sql schema
npx lmnr-cli@latest sql query "SELECT start_time, total_tokens, status FROM traces ORDER BY start_time DESC LIMIT 10"
npx lmnr-cli@latest sql query "SELECT name, model, total_tokens FROM spans WHERE name='ai.generateText' ORDER BY start_time DESC LIMIT 5"
```
Tables: `spans`, `traces`, `events`. Or use the dashboard at https://lmnr.ai (the project that
owns `LMNR_PROJECT_API_KEY`). Note: the `@lmnr-ai/lmnr` bundled `lmnr` binary has NO trace query
(only `eval`/`dev`); use the separate `lmnr-cli` package for SQL.

### Memory (the data dir)
Inspect what the agent has stored from the bot machine:
```bash
fly ssh console -a <your-app> -C "ls -R /data"
fly ssh console -a <your-app> -C "cat /data/MEMORY.md"
fly ssh console -a <your-app> -C "cat /data/reminders/*.yaml"
```

### Composio (Gmail/Calendar connections)
Write a one-off script in the project dir (so `node_modules` resolves) and run with `tsx --env-file=.env`:
```ts
import { Composio } from "@composio/core";
const c = new Composio();
const list = await c.connectedAccounts.list({ userIds: [process.env.COMPOSIO_USER_ID!] });
console.log(list.items.map(a => `${a.toolkit?.slug}=${a.status}`));
```
Connections should be `ACTIVE`. If `INITIALIZING`/`EXPIRED`, the Google OAuth wasn't completed —
regenerate a link with `c.connectedAccounts.link(userId, authConfigId)` and finish the consent flow.
Auth configs: Gmail `<gmail-auth-config-id>`, Calendar `<calendar-auth-config-id>` (both Composio-managed).

## Tool safety
Composio tools are curated to **read + draft + create only** — no sending email, no deleting.
Edit the `COMPOSIO_TOOLS` array in `src/tools/composio.ts` to change the set (then redeploy).
Full toolkit lists: `composio.tools.get(userId, { toolkits: ["gmail"] })`. The `bash` tool, by
contrast, is a real unrestricted shell rooted at `DATA_DIR` — that's intentional (it's how the
agent manages its own memory), but keep it in mind.
