import type { ModelMessage } from "ai";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { conversationsDir } from "./config";

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

export const getConversationHistoryWindow = async (): Promise<
  ModelMessage[]
> => {
  const yesterday = new Date(Date.now() - 86400_000).toLocaleDateString(
    "en-CA",
  );
  const entries = [
    ...(await readJson<Logged[]>(dayFile(yesterday), [])),
    ...(await readJson<Logged[]>(dayFile(today()), [])),
  ];
  return entries.map((e) => ({ role: e.role, content: e.content }));
};
