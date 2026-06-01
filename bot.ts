import { Bot } from "grammy";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { Laminar, getTracer } from "@lmnr-ai/lmnr";
import { z } from "zod";
import { Memory } from "mem0ai/oss";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";

// Laminar tracing (OTel) — initialize once; pass getTracer() to each AI SDK call below.
Laminar.initialize({ projectApiKey: process.env.LMNR_PROJECT_API_KEY });

// Mem0 hardcodes response_format {type:"json_object"}, which the AI Gateway rejects
// (it only accepts json_schema). The OpenAI SDK uses its own fetch, so a monkeypatch
// can't reach it — instead run a tiny in-process proxy that rewrites the field and
// forwards to the gateway. Keeps ALL inference on one AI_GATEWAY_API_KEY.
const GATEWAY_ORIGIN = "https://ai-gateway.vercel.sh";
const proxy = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    let body = Buffer.concat(chunks).toString("utf8");
    try {
      const b = JSON.parse(body);
      if (b?.response_format?.type === "json_object") {
        b.response_format = { type: "json_schema", json_schema: { name: "response", schema: { type: "object" } } };
        body = JSON.stringify(b);
      }
    } catch {}
    const r = await fetch(GATEWAY_ORIGIN + req.url, {
      method: req.method,
      headers: { authorization: req.headers.authorization ?? "", "content-type": "application/json" },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
    res.end(Buffer.from(await r.arrayBuffer()));
  });
});
await new Promise<void>((ok) => proxy.listen(8788, "127.0.0.1", ok));

// Self-hosted Mem0 — extraction LLM + embeddings both routed through the gateway
// (via the proxy above, one AI_GATEWAY_API_KEY, no OpenAI key). Vectors persist in
// a dedicated Qdrant Fly app when QDRANT_URL is set; otherwise in-memory for local dev.
const gateway = { apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: "http://127.0.0.1:8788/v1" };
const memory = new Memory({
  llm: { provider: "openai", config: { ...gateway, model: "openai/gpt-4o-mini" } },
  embedder: { provider: "openai", config: { ...gateway, model: "openai/text-embedding-3-small", embeddingDims: 1536 } },
  ...(process.env.QDRANT_URL && {
    vectorStore: { provider: "qdrant", config: { url: process.env.QDRANT_URL, collectionName: "memories", dimension: 1536 } },
  }),
});

const recall = async (query: string, userId: string) => {
  try {
    const { results } = await memory.search(query, { userId });
    return results.map((r: { memory: string }) => `- ${r.memory}`).join("\n");
  } catch {
    return "";
  }
};

// Composio: a curated set of Gmail + Google Calendar tools for the connected Google
// account (scoped to COMPOSIO_USER_ID). Skipped if env not set, so local dev still runs.
const COMPOSIO_TOOLS = [
  // Email: read + DRAFT only — the bot never sends; you review and send from Gmail.
  "GMAIL_FETCH_EMAILS", "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", "GMAIL_CREATE_EMAIL_DRAFT", "GMAIL_SEARCH_PEOPLE",
  // Calendar: view + create only (no delete).
  "GOOGLECALENDAR_FIND_EVENT", "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS", "GOOGLECALENDAR_EVENTS_GET",
  "GOOGLECALENDAR_FREE_BUSY_QUERY", "GOOGLECALENDAR_CREATE_EVENT",
];
let composioTools: Record<string, any> = {};
if (process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_USER_ID) {
  try {
    composioTools = await new Composio({ provider: new VercelProvider() })
      .tools.get(process.env.COMPOSIO_USER_ID, { tools: COMPOSIO_TOOLS });
  } catch (e: any) {
    console.error("Composio tools unavailable:", e.message);
  }
}

const tools = {
  tavily_search: tool({
    description: "Search the web with Tavily and return the top results as JSON.",
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, max_results: 5 }),
      });
      return JSON.stringify(await r.json());
    },
  }),
  ...composioTools,
};

const run = async (messages: ModelMessage[], userId: string) => {
  const last = messages[messages.length - 1];
  const query = typeof last?.content === "string" ? last.content : "";
  const memories = await recall(query, userId);

  const result = await generateText({
    model: "google/gemini-2.5-flash",
    tools,
    stopWhen: stepCountIs(20),
    system:
      "You are a helpful personal assistant with long-term memory, web search, and access to " +
      "the user's Gmail and Google Calendar. Use web search for current information. For email you can " +
      "read messages and prepare DRAFTS only — you cannot send, so tell the user to review and send the " +
      "draft from Gmail. You can view the calendar and create events. " +
      `The current date and time is ${new Date().toString()} — use it to resolve "today", "tomorrow", etc. ` +
      "Below is what you remember about this user — rely on it, weave it in naturally.\n\n--- MEMORY ---\n" +
      (memories || "(nothing yet)"),
    messages,
    // Laminar needs its tracer passed explicitly (initialize() does NOT auto-instrument).
    experimental_telemetry: { isEnabled: true, tracer: getTracer() },
  });

  // Push the exchange to long-term memory; Mem0 extracts/dedupes facts for us.
  memory
    .add(
      [
        { role: "user", content: query },
        { role: "assistant", content: result.text },
      ],
      { userId },
    )
    .catch(() => {});

  return result;
};

const { values: { mode } } = parseArgs({ options: { mode: { type: "string" } } });

if (mode === "telegram") {
  const messages: ModelMessage[] = [];
  const bot = new Bot(process.env.TELEGRAM_TOKEN!);
  bot.on("message:text", async (ctx) => {
    messages.push({ role: "user", content: ctx.message.text });
    const result = await run(messages, `tg:${ctx.chat.id}`);
    messages.push(...result.response.messages);
    await ctx.reply(result.text.slice(0, 4096));
  });
  bot.start();

} else if (mode === "cli") {
  const rl = createInterface({ input: stdin, output: stdout });
  const messages: ModelMessage[] = [];
  while (true) {
    let line: string;
    try {
      line = (await rl.question("USER: ")).trim();
    } catch {
      break;
    }
    if (line === "exit") break;
    if (!line) continue;
    messages.push({ role: "user", content: line });
    const result = await run(messages, "cli");
    messages.push(...result.response.messages);
    console.log(`\nAGENT: ${result.text}\n`);
  }
  await Laminar.shutdown();
  process.exit(0);

} else {
  console.error("Specify --mode telegram or --mode cli");
  process.exit(1);
}
