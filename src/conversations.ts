import type { ModelMessage } from "ai";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { conversationsDir } from "./config";

const MAX_HISTORY = 25; // most recent messages injected into context

const today = () => new Date().toLocaleDateString("en-CA"); // TODO: make this an env var
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
  const path = dayFile(today());
  const entries = await readJson<Logged[]>(path, []);
  entries.push({ role, content, ts: Date.now() });
  await writeFile(path, JSON.stringify(entries, null, 2));
};

// The most recent MAX_HISTORY messages, oldest→newest. Reads day files newest-first
// only until it has enough, so it spans day boundaries without loading everything.
export const getConversationHistoryWindow = async (): Promise<
  ModelMessage[]
> => {
  const files = (await readdir(conversationsDir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  const entries: Logged[] = [];
  for (const f of files) {
    entries.unshift(...(await readJson<Logged[]>(join(conversationsDir, f), [])));
    if (entries.length >= MAX_HISTORY) break;
  }
  return entries.slice(-MAX_HISTORY).map((e) => ({ role: e.role, content: e.content }));
};
