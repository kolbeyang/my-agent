# my-agent — personal-assistant Telegram bot

A minimal personal assistant: a Telegram bot (grammY) on the Vercel AI SDK, with
persistent long-term memory (Mem0 + Qdrant), Gmail + Google Calendar tools
(Composio), and tracing (Laminar). All LLM inference runs through the Vercel AI
Gateway on a single key. Deployed on Fly.io.

Telegram bot: **@harry_260131_bot**

## Architecture (one file: `bot.ts`)

```
Telegram ──► bot.ts (grammY, long-poll) ──► generateText (Vercel AI SDK)
                 │                              model: google/gemini-2.5-flash via AI Gateway
                 │                              tools: tavily_search + Composio (Gmail/Calendar)
                 │                              tracing: Laminar (getTracer)
                 ├─ before each turn: memory.search() → inject recalled facts into system prompt
                 └─ after each turn:  memory.add()    → Mem0 extracts/stores facts
                       Mem0 LLM+embeddings ─► localhost proxy (:8788) ─► AI Gateway
                       Mem0 vectors ─────────► Qdrant (my-agent-qdrant.flycast:6333)
```

Everything lives in `bot.ts` (~150 lines). Two run modes: `--mode telegram`
(long-polling worker) and `--mode cli` (local REPL for testing).

### The pieces
- **Model / inference:** `google/gemini-2.5-flash` through the **Vercel AI Gateway**
  (`AI_GATEWAY_API_KEY`). Mem0's extraction LLM (`openai/gpt-4o-mini`) and embeddings
  (`openai/text-embedding-3-small`, 1536 dims) also go through the Gateway — one key for everything.
- **Memory:** self-hosted **Mem0** (`mem0ai/oss`, v2). `search` before each turn, `add` after.
  Vectors persist in **Qdrant** when `QDRANT_URL` is set; else in-memory (local dev).
- **Tools:** `tavily_search` (web) + **Composio** Gmail/Calendar (curated, read+draft+create only).
- **Tracing:** **Laminar** — `Laminar.initialize()` + `tracer: getTracer()` on the AI SDK call.

## Key gotchas (read before changing things)

1. **The localhost proxy (`:8788`) is required, not cruft.** Mem0 hardcodes
   `response_format: {type:"json_object"}`, which the AI Gateway rejects (it only accepts
   `json_schema`). Mem0 exposes no fetch/client hook, so a tiny in-process proxy rewrites the
   field on the way to the Gateway. Confirmed unfixable by upgrading to Mem0 v3. Don't remove it
   while routing Mem0 through the Gateway.
2. **Laminar needs `tracer: getTracer()`** on every AI SDK call. `initialize()` alone does NOT
   auto-instrument — without the tracer, the dashboard stays empty.
3. **Mem0 is pinned to v2** on purpose. v3 is a breaking rewrite (search `limit`→`topK`, entity
   IDs into `filters`, new `threshold` that drops recalls) and does NOT remove the proxy. Don't upgrade.
4. **Composio user id is `pg-test-5669300d-...`** (`COMPOSIO_USER_ID`) — the Google account is
   connected under that Composio user. Tools are fetched for that id at startup.
5. **`.internal` DNS doesn't reach Qdrant — use `.flycast`.** `QDRANT_URL=http://my-agent-qdrant.flycast:6333`.
6. **Short-term history (`messages[]`) is one module-level array** shared across chats — fine for
   single-user, would mix histories with multiple Telegram users.

## Running locally

```bash
cp .env.example .env     # fill in keys (see below)
pnpm try                 # CLI REPL — type messages, "exit" to quit  (best for testing)
pnpm dev                 # Telegram bot with --watch (needs TELEGRAM_TOKEN)
```
`pnpm try` runs the full stack (Gateway, Mem0, Composio, Qdrant if `QDRANT_URL` set). Without
`QDRANT_URL`, memory is in-memory (wiped on exit) — fine for testing logic.

### Environment variables (`.env`)
| Var | Required | What |
|---|---|---|
| `TELEGRAM_TOKEN` | yes (telegram) | bot token from @BotFather |
| `AI_GATEWAY_API_KEY` | yes | all inference (chat + Mem0) via Vercel AI Gateway |
| `TAVILY_API_KEY` | for web search | tavily.com |
| `LMNR_PROJECT_API_KEY` | for tracing | Laminar project key |
| `QDRANT_URL` | prod only | persistent vectors; unset = in-memory |
| `COMPOSIO_API_KEY` | for Gmail/Cal | composio.dev |
| `COMPOSIO_USER_ID` | for Gmail/Cal | Composio user the Google account is connected under |

## Deploying (Fly.io)

Two apps in region `iad`:
- **`my-agent-mem0`** — the bot (worker, no public port, long-polls Telegram). Image built from `Dockerfile`.
- **`my-agent-qdrant`** — Qdrant vector DB (image `qdrant/qdrant`, volume `qdrant_data` at
  `/qdrant/storage`, reached via Flycast). Config in `qdrant/fly.toml`.

```bash
# deploy the bot (most common)
fly deploy -a my-agent-mem0 --ha=false

# deploy/redeploy qdrant (rare — only if you change qdrant/fly.toml)
fly deploy -c qdrant/fly.toml -a my-agent-qdrant

# set / rotate a secret (auto-restarts the machine)
fly secrets set KEY=value -a my-agent-mem0
fly secrets list -a my-agent-mem0
```

Build notes: `package.json` pins `packageManager: pnpm@10.25.0` (newer pnpm enforces a
`minimumReleaseAge` supply-chain policy that fails the build) and `pnpm.onlyBuiltDependencies`
allows `better-sqlite3` (Mem0's history store) to compile in the Docker image.

## Restarting

```bash
fly apps restart my-agent-mem0          # restart the bot
fly machine restart <id> -a my-agent-mem0
fly status -a my-agent-mem0             # machine state
```
The bot is a worker (no health-checked HTTP service); it stays running 24/7. Restarting reloads
secrets and re-fetches Composio tools at startup. In-process state (the `messages[]` history)
is lost on restart; long-term memory (Qdrant) survives.

## Debugging

### Logs
```bash
fly logs -a my-agent-mem0               # live tail
fly logs -a my-agent-mem0 --no-tail     # recent
fly logs -a my-agent-qdrant             # qdrant
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

### Qdrant (memory vectors)
From the bot machine (Node has fetch; `.flycast` works, `.internal` does NOT):
```bash
fly ssh console -a my-agent-mem0 -C "node -e \"fetch('http://my-agent-qdrant.flycast:6333/collections/memories').then(r=>r.json()).then(d=>console.log(JSON.stringify(d.result?.points_count)))\""
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
Auth configs: Gmail `ac_fQ1z3CdV7Fig`, Calendar `ac_vQLolI2SfAVK` (both Composio-managed).

## Tool safety
Composio tools are curated to **read + draft + create only** — no sending email, no deleting.
Edit the `COMPOSIO_TOOLS` array in `bot.ts` to change the set (then redeploy). Full toolkit lists:
`composio.tools.get(userId, { toolkits: ["gmail"] })`.
