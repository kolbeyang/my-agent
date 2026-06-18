import { join, resolve } from "node:path";

export const DATA_DIR = resolve(process.env.DATA_DIR ?? "./data");
export const conversationsDir = join(DATA_DIR, "conversations");
export const memoryDir = join(DATA_DIR, "memory");
export const remindersDir = join(DATA_DIR, "reminders");
