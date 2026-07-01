import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { Agent, Channel } from "../types";

export function createHttp(): Channel {
  const listen = (agent: Agent) => {
    const token = process.env.HTTP_AUTH_TOKEN;
    if (!token) {
      console.warn("http surface skipped: set HTTP_AUTH_TOKEN to enable it");
      return;
    }
    const port = Number(process.env.HTTP_PORT) || 8787;

    const app = new Hono();
    app.use("/ask", bearerAuth({ token }));
    app.post("/ask", async (c) => {
      let text: unknown;
      try {
        ({ text } = await c.req.json());
      } catch {
        return c.json({ error: "expected JSON body { text }" }, 400);
      }
      if (typeof text !== "string" || !text.trim())
        return c.json({ error: "missing text" }, 400);

      // Reply to this caller: accumulate the streamed turn into the response.
      let reply = "";
      const deliver = async (stream: AsyncIterable<string>) => {
        for await (const delta of stream) reply += delta;
      };
      const sendFile = async (absPath: string, caption?: string) => {
        reply += `\n[file: ${absPath}${caption ? ` — ${caption}` : ""}]`;
      };
      await agent.runTurn(text, deliver, sendFile);
      return c.json({ reply });
    });

    serve({ fetch: app.fetch, port });
    console.log(`http surface listening on :${port}`);
  };

  return { listen };
}
