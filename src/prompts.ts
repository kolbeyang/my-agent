import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MEMORY_ROOT } from "./config";

const AGENTS = readFileSync(
  join(import.meta.dirname, "AGENTS.md"),
  "utf8",
).trim();

const memoryFile = join(MEMORY_ROOT, "MEMORY.md");

export const buildSystemPrompt = async () => {
  let memory = "";
  try {
    memory = (await readFile(memoryFile, "utf8")).trim();
  } catch {}
  return `${AGENTS}\n${memory}\nThe current date and time is ${new Date().toString()}\n`;
};

export const REMINDER_PROMPT =
  "[REMINDER] This is a reminder you scheduled yourself to carry out a request from the user:";
