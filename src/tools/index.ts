import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { bash } from "./bash";
import { getComposioTools } from "./composio";
import { readFile, writeFile } from "./files";
import { web_extract, web_search } from "./web";

export const coreTools = {
  bash,
  readFile,
  writeFile,
  web_search,
  web_extract,
  list_tools: tool({
    description:
      "Reveal your extra tools. Call this when a request needs something your core tools can't do, then call the tool you need.",
    inputSchema: z.object({}),
    execute: async () =>
      Object.entries<any>(extraTools)
        .map(([name, t]) => `- ${name}: ${t.description ?? ""}`)
        .join("\n") || "No extra tools available.",
  }),
};

const extraTools = await getComposioTools();
export const tools: ToolSet = { ...coreTools, ...extraTools };
