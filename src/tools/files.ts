import { tool } from "ai";
import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { WORKSPACE_ROOT } from "../config";

export const MAX_OUTPUT = 30_000; // cap tool output so it doesn't blow the context window

// Middle-truncate: keep the head and tail, drop the middle.
export const truncate = (s: string) =>
  s.length <= MAX_OUTPUT
    ? s
    : `${s.slice(0, MAX_OUTPUT / 2)}\n…[truncated ${s.length - MAX_OUTPUT} chars]…\n${s.slice(-MAX_OUTPUT / 2)}`;

// Tail-truncate: keep the last `max` chars, report how many were dropped.
export const tailTruncate = (
  s: string,
  max = MAX_OUTPUT,
): { text: string; omitted: number } =>
  s.length <= max
    ? { text: s, omitted: 0 }
    : { text: s.slice(s.length - max), omitted: s.length - max };

export const readFile = tool({
  description: "Read a file (path relative to your home directory; memory lives in ./memory).",
  inputSchema: z.object({ path: z.string() }),
  execute: async ({ path }) => {
    try {
      return { content: truncate(await fsReadFile(resolve(WORKSPACE_ROOT, path), "utf8")) };
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  },
});

export const writeFile = tool({
  description:
    "Write (overwrite) a file, path relative to your home directory (memory lives in ./memory). Prefer this over bash heredocs for multi-line content.",
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  execute: async ({ path, content }) => {
    const full = resolve(WORKSPACE_ROOT, path);
    await mkdir(dirname(full), { recursive: true });
    await fsWriteFile(full, content);
    return { ok: true, path };
  },
});
