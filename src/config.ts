import { join, resolve } from "node:path";

// Single source of truth for on-disk locations. DATA_DIR is the agent's memory
// (a git repo); the subdirectories below are created on boot in bot.ts.
export const DATA_DIR = resolve(process.env.DATA_DIR ?? "./data");
export const conversationsDir = join(DATA_DIR, "conversations");
export const memoryDir = join(DATA_DIR, "memory");
export const remindersDir = join(DATA_DIR, "reminders");
