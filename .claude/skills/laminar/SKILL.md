---
name: laminar-debug-trace
description: "Use when building, testing, or debugging an LLM agent instrumented with Laminar. Covers recording a run under LMNR_DEBUG, inspecting the resulting trace with the Laminar CLI's SQL, replaying cached LLM calls to iterate fast and deterministically, and annotating debug sessions (names + per-trace markdown notes) so the user can follow what happened."
---

# Laminar Debugger

## Your role

You are the **parent agent**: the coding agent doing the building. The **child
agent** is the AI agent you are working on. Laminar exposes a suite of tools you must use to build, test, and debug more effectively.

You also own a second responsibility the human relies on: **making the debug
session legible**. You name each session and write a markdown note on every
trace, because the user reads those notes — not the raw spans — to understand
what you did and why.

## The core loop

**Record** — run the child agent once under the debugger to capture a trace.

**Inspect** — query the trace to understand what happened and where it went
wrong.

**Annotate** — name the session and write a note on the trace so the run is
self-explanatory in the UI.

**Replay + edit** — make your code/prompt change, then re-run replaying the
cached calls up to the point of interest and executing live past it.

**Repeat** — each iteration only pays for the calls that actually changed.

## Prerequisite: instrument the child agent

Before any of this works, the child agent must be properly instrumented with Laminar. If this has not been done yet, you can learn how to instrument [here](https://laminar.sh/docs/tracing/integrations/overview).

## Prerequisite: access the CLI

Make sure the Laminar CLI is working in your environment. Learn more about the CLI [here](https://laminar.sh/docs/platform/cli#cli).

## 1. Record a run

Run the child agent with debug mode on:

```bash
LMNR_DEBUG=true python my_agent.py        # or whatever the run command is
```

Truthy values are `true`, `1`, `yes`, `on`. A debug run:

- mints a debug session and registers it with Laminar,
- exports all spans as a normal trace,
- prints a debugger URL you can open in the UI, and
- writes a pointer file at `./.lmnr/last-run.json` with this run's ids, and
  prints the same payload to the console (prefixed `LMNR_DEBUG_RUN `) for when
  the filesystem isn't available. (It may also be a good idea to gitignore the `.lmnr` directory.)

The pointer file is the handoff between runs

```json
{
  "trace_id": "…",
  "session_id": "…",
  "replay_trace_id": null,
  "cache_until": 0,
  "debugger_url": "https://…/project/<projectId>/debugger-sessions/<sessionId>",
  "started_at": "…"
}
```

Use `LMNR_DEBUG_SESSION_ID` in all consequent runs to associate traces with the current session.

```bash
LMNR_DEBUG=true LMNR_DEBUG_SESSION_ID=<session-id> node my_agent.js
```

## 2. Name the session and note every trace

This is not optional. The session view is how the human follows your work, and a
bare session of unlabeled traces is unreadable.

Name the session once, describing the investigation:

```bash
npx lmnr-cli debug session set-name <session-id> "Fix report length + search tool"
```

Then write a note on **every** trace you produce (aim for ~20–200 words of
well-structured markdown — headings, short lists, inline code). The note is
rendered in the UI and is the user's primary account of what happened in this
run: what you were testing, what the trace shows, what you changed, and what to
look at next.

```bash
npx lmnr-cli trace append-note <trace-id> "## What this run tests
Replays the first 3 calls, runs the 4th (report synthesis) live with the new
length cap. The <span id='<spanId>' name='synthesis call' /> now returns ~180
words (was ~600)."
```

Notes are **append-only**: each `append-note` call adds a new paragraph to the
trace's existing note — never re-send the whole note, just the new entry.

To re-orient yourself in an ongoing session (e.g. after a context reset), dump
every trace's note in order:

```bash
npx lmnr-cli debug session summary <session-id>          # or --json
```

Output is one block per trace, oldest first — the note followed by a
`<trace id="…" end-time="…"/>` tag you can feed back into the SQL queries
below.

Reference a specific span by embedding a **span tag** in the note — the UI
renders it as a clickable **span chip** that opens that span in the trace view:

```text
<span id='<spanId>' name='the synthesis call' />
```

- `id` is the span's UUID — the `span_id` you get from the SQL queries below.
- `name` is the chip's label (free text; keep it short).
- Optional `reference_text='…'` adds a muted inline preview after the label, e.g.
  `<span id='<spanId>' name='synthesis' reference_text='~180 words, was ~600' />`.

The span must belong to the trace the note is attached to.

Open the session in the browser straight from the pointer file:

```bash
open "$(jq -r .debugger_url .lmnr/last-run.json)"   # macOS; use xdg-open on Linux
```

## 3. Inspect the trace with SQL

The printed URL is optimized for humans; for *you*, querying is faster and more
precise. Every debug run stamps `rollout.session_id` on its trace, so you can
filter to exactly the runs you care about:

```sql
SELECT id AS trace_id, start_time, status, total_tokens
FROM traces
WHERE simpleJSONExtractString(metadata, 'rollout.session_id') = '<session-id>'
ORDER BY start_time DESC
LIMIT 10;
```

Run it through the CLI:

```bash
npx lmnr-cli sql query "SELECT id, start_time, status FROM traces ORDER BY start_time DESC LIMIT 20"
```

To locate the failure, read the trace's spans in order — which LLM call produced
the bad output, what its inputs were, and how far into the loop it happened.
That tells you where to set your replay boundary. `input`/`output` columns are
large, so select them only for the span you care about (and paginate):

```sql
SELECT span_id, name, span_type, start_time, status
FROM spans
WHERE trace_id = '<trace-id>'
ORDER BY start_time ASC;
```

`span_type` is one of `LLM`, `TOOL`, `DEFAULT`, or `CACHED` (a replayed LLM
call in a replay run's trace). To count the calls along the loop (this is what
`LMNR_DEBUG_CACHE_UNTIL` indexes into — replayed calls count too, so include
`CACHED` when the source trace is itself a replay):

```sql
SELECT count() FROM spans
WHERE trace_id = '<trace-id>' AND span_type IN ('LLM', 'CACHED');
```

Discover the full schema any time with `npx lmnr-cli sql schema`. Useful tables:
`spans`, `traces`, `events`, and `signal_events`.

### Signal events — recent errors and insights

`signal_events` records signals fired during runs (evaluation failures,
flagged conditions, insights). Scan it to surface what recently went wrong
without reading every trace:

```sql
SELECT timestamp, name, trace_id, payload
FROM signal_events
ORDER BY timestamp DESC
LIMIT 20;
```

Join back to the offending trace with the `trace_id`, then drop into its spans.

### Self-hosted / local Laminar

The CLI defaults to `https://api.lmnr.ai`. Point it at a local app-server with
flags (or `LMNR_BASE_URL` / `LMNR_PORT` in the environment):

```bash
npx lmnr-cli sql query "…" --base-url http://localhost --port 8000
```

## 4. Replay to iterate fast

After editing the child agent, re-run seeded from the last run:

```bash
LMNR_DEBUG=true LMNR_DEBUG_FROM_LAST_RUN=true LMNR_DEBUG_CACHE_UNTIL=3 node my_agent.js
```

This replays the LLM calls along the agent's main loop from the source trace's
cache instead of hitting the model. Calls inside the cache window return their
recorded responses instantly; past it, the run goes live.

`LMNR_DEBUG_FROM_LAST_RUN` seeds `replay_trace_id` / `session_id` /
`cache_until` from the pointer file, but a fresh record run's pointer has
`cache_until: 0` — and **a zero cache window means no replay at all** (the run
is fully live). Always set `LMNR_DEBUG_CACHE_UNTIL` explicitly; individual
`LMNR_DEBUG_*` vars override the pointer file per field.

`LMNR_DEBUG_CACHE_UNTIL` accepts either form:

- **A count `N`** — replay the first N calls along the loop, then go live.
- **A span id** — replay *through* that span (inclusive: the named call itself
  comes from cache, the next one runs live). Accepts the span's full UUID, the
  last two UUID groups, the 16-hex OTel id, or any hex suffix — whatever you
  copied from SQL or the UI. A span id that isn't one of the loop's LLM calls
  warns and runs fully live.

```bash
LMNR_DEBUG=true \
LMNR_DEBUG_REPLAY_TRACE_ID=<trace-id> \
LMNR_DEBUG_CACHE_UNTIL=<n-or-span-id> \
node my_agent.js
```

Replaying up to *just before* the buggy call lets you re-run that one call live
with your fix, over and over, without re-executing everything that led up to it
— with the span-id form, pass the id of the call **before** the buggy one
(inclusive semantics). Set the window *past* the change to validate that the
rest of the loop now behaves. Each replayed iteration produces a new trace
under the same session, so attempts compare side by side in the UI (and you
should note each one — see step 2). Replayed traces can themselves be replay
sources — their cached calls count as loop positions just like live ones.

## What to keep in mind

**Replay is best-effort and never blocks you.** If the cache can't be built (no
clear loop in the source trace, or overlapping/parallel calls it can't safely
sequence), the run silently falls back to fully live — you still get a normal
debug trace, just no speedup. A live fallback is not an error.

**Replay assumes a sequential agent loop.** Wildly parallel LLM fan-out won't
replay cleanly; that's expected.

**Move your boundary, not your whole approach.** The fastest rhythm is: replay
up to the suspect call → tweak → re-run → read the new trace → adjust the
boundary. Resist re-running fully live every time — that's the cost the debugger
exists to avoid.

**Turn it off for production / normal runs** by simply not setting `LMNR_DEBUG`.
Everything is inert when it's unset.
