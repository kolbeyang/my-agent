import { getTracer, wrapLanguageModel } from "@lmnr-ai/lmnr";
import { gateway as aiGateway, generateText, stepCountIs } from "ai";
import { Mutex } from "async-mutex";
import { Cron } from "croner";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { remindersDir } from "./config";
import { getConversationHistoryWindow, logMessage } from "./conversations";
import { getSystemPrompt, REMINDER_PROMPT } from "./prompts";
import { tools } from "./tools";
import { reminderSchema } from "./types";

const model = wrapLanguageModel(aiGateway("google/gemini-3.5-flash"));

export type Agent = {
  runTurn: (message: string) => Promise<void>;
  syncReminders: () => Promise<void>;
};
export type CreateAgent = (deliver: (text: string) => Promise<void>) => Agent;

// An agent is bound to one delivery channel (a Telegram chat, or the CLI). The
// channel is injected here rather than held in a module-level mutable, so runTurn
// and the reminder scheduler close over it cleanly.
export const createAgent: CreateAgent = (deliver) => {
  // One turn (or firing reminder) runs at a time. async-mutex gives FIFO
  // serialization and releases even if the body throws — no poisoned lock.
  const lock = new Mutex();
  // id (= reminder filename) -> its file mtime + live cron job.
  const jobs = new Map<string, { mtimeMs: number; job: Cron }>();

  const runTurn = (message: string) =>
    lock.runExclusive(async () => {
      try {
        await logMessage("user", message);
        const result = await generateText({
          model,
          tools,
          stopWhen: stepCountIs(20),
          system: getSystemPrompt(),
          messages: await getConversationHistoryWindow(),
          experimental_telemetry: { isEnabled: true, tracer: getTracer() },
        });
        if (result.text.trim()) {
          await deliver(result.text);
          await logMessage("assistant", result.text);
        }
      } catch (e: any) {
        console.error("turn failed:", e?.message ?? e);
      }
      await syncReminders();
    });

  // Reminders are one YAML file each at /reminders/<id>.yaml (filename = id).
  // We only (re)schedule files whose mtime changed since last sync, and stop
  // jobs whose file was deleted — so an edit to one reminder doesn't churn the
  // rest. Called on boot and at the end of every turn.
  const syncReminders = async () => {
    const files = (await readdir(remindersDir)).filter((f) =>
      f.endsWith(".yaml"),
    );
    const present = new Set<string>();

    for (const file of files) {
      const id = file.slice(0, -".yaml".length);
      const path = join(remindersDir, file);
      const { mtimeMs } = await stat(path);
      present.add(id);

      if (jobs.get(id)?.mtimeMs === mtimeMs) continue; // unchanged → leave it be
      jobs.get(id)?.job.stop();
      jobs.delete(id);

      let reminder;
      try {
        reminder = reminderSchema.parse(parseYaml(await readFile(path, "utf8")));
      } catch (e: any) {
        console.error(`reminder ${id} invalid, skipping:`, e?.message ?? e);
        continue;
      }

      // A one-shot whose instant has already passed (fired, or missed while the
      // bot was down) is deleted, not scheduled.
      if (reminder.type === "absolute" && Date.parse(reminder.at) <= Date.now()) {
        await rm(path, { force: true });
        continue;
      }

      const pattern = reminder.type === "repeating" ? reminder.cron : reminder.at;
      const onFire = async () => {
        // One-shots remove themselves before running, so the post-turn sync
        // doesn't re-see (and re-fire) them.
        if (reminder.type === "absolute") {
          jobs.get(id)?.job.stop();
          jobs.delete(id);
          await rm(path, { force: true });
        }
        await runTurn(`${REMINDER_PROMPT} ${reminder.prompt}`);
      };
      try {
        const job = new Cron(pattern, { timezone: reminder.tz }, onFire);
        jobs.set(id, { mtimeMs, job });
      } catch (e: any) {
        console.error(`reminder ${id} unschedulable, skipping:`, e?.message ?? e);
      }
    }

    // Files deleted on disk → stop and forget their jobs.
    for (const [id, { job }] of jobs) {
      if (!present.has(id)) {
        job.stop();
        jobs.delete(id);
      }
    }
  };

  return { runTurn, syncReminders };
};
