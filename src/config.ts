import { join, resolve } from "node:path";

// Bash cwd + readFile/writeFile root — the agent's "computer".
export const WORKSPACE_ROOT = resolve(process.env.WORKSPACE_ROOT ?? "./workspace");
// Memory unit, relative to the workspace so it always lives inside it.
export const MEMORY_ROOT = resolve(WORKSPACE_ROOT, process.env.MEMORY_ROOT ?? "memory");

export const conversationsDir = join(MEMORY_ROOT, "conversations");
export const notesDir = join(MEMORY_ROOT, "notes");
export const remindersDir = join(MEMORY_ROOT, "reminders");
