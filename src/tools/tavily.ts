import { tool } from "ai";
import { z } from "zod";

export const tavily_search = tool({
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
});
