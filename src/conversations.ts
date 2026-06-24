import type { ModelMessage } from "ai";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { conversationsDir } from "./config";

const MAX_HISTORY = 25; // most recent messages injected into context

const dayFile = (date: string) => join(conversationsDir, `${date}.json`);

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
};

type Logged = { role: "user" | "assistant"; content: string; ts: number };

export const logMessage = async (role: Logged["role"], content: string) => {
  const path = dayFile(new Date().toLocaleDateString("en-CA"));
  const entries = await readJson<Logged[]>(path, []);
  entries.push({ role, content, ts: Date.now() });
  await writeFile(path, JSON.stringify(entries, null, 2));
};

// The most recent MAX_HISTORY messages, oldest→newest. Reads day files newest-first
// only until it has enough, so it spans day boundaries without loading everything.
export const getConversationHistoryWindow = async (): Promise<
  ModelMessage[]
> => {
  const files = (await readdir(conversationsDir)).sort().reverse();
  const all_entries: Logged[] = [];
  for (const f of files) {
    const entries = await readJson<Logged[]>(join(conversationsDir, f), []);
    all_entries.unshift(...entries);
    if (all_entries.length >= MAX_HISTORY) break;
  }
  return all_entries
    .slice(-MAX_HISTORY)
    .map((e) => ({ role: e.role, content: e.content }));
};
