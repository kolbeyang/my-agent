import { wrapLanguageModel } from "@lmnr-ai/lmnr";
import { gateway as aiGateway, isStepCount, tool, ToolLoopAgent, type ToolSet } from "ai";
import { Mutex } from "async-mutex";
import { Cron } from "croner";
import { readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { remindersDir, WORKSPACE_ROOT } from "./config";
import { getConversationHistoryWindow, logMessage } from "./conversations";
import { buildSystemPrompt, REMINDER_PROMPT } from "./prompts";
import { coreTools, tools } from "./tools";
import { reminderSchema } from "./types";

// wrapLanguageModel is a no-op in normal runs; it enables Laminar debugger
// replay caching when LMNR_DEBUG replay vars are set.
const model = wrapLanguageModel(aiGateway("google/gemini-3.5-flash"));

export type Agent = {
  runTurn: (message: string) => Promise<void>;
  syncReminders: () => Promise<void>;
};
// Channels consume the reply as a stream of text deltas; they decide how to
// render it (CLI prints, Telegram edits a message).
export type Deliver = (stream: AsyncIterable<string>) => Promise<void>;
// Sends a file (chart/image) to the user. Path is already resolved to absolute.
export type SendImage = (absolutePath: string, caption?: string) => Promise<void>;
export type CreateAgent = (deliver: Deliver, sendImage: SendImage) => Agent;

export const createAgent: CreateAgent = (deliver, sendImage) => {
  const lock = new Mutex();
  let jobs: Cron[] = [];

  // Channel-bound tool: lets the agent push an image (e.g. a chart it rendered) to the user.
  const send_image = tool({
    description:
      "Send an image file to the user in the chat (e.g. a chart PNG you generated). Path is relative to your home directory; optional short caption.",
    inputSchema: z.object({ path: z.string(), caption: z.string().optional() }),
    execute: async ({ path, caption }) => {
      try {
        await sendImage(resolve(WORKSPACE_ROOT, path), caption);
        return { ok: true };
      } catch (e: any) {
        return { error: e?.message ?? String(e) };
      }
    },
  });
  const coreNames = [...Object.keys(coreTools), "send_image"];
  const allTools: ToolSet = { ...tools, send_image };
  // Only core tools are advertised; list_tools reveals the rest, activated once called.
  const revealExtraToolsAfterListTools = ({ steps }: { steps: any[] }) => {
    const calledListTools = steps.some((s) =>
      s.toolCalls.some((c: any) => c.toolName === "list_tools"),
    );
    return { activeTools: calledListTools ? Object.keys(allTools) : coreNames };
  };

  const runTurn = (message: string) =>
    lock.runExclusive(async () => {
      try {
        await logMessage("user", message);
        const agent = new ToolLoopAgent({
          model,
          tools: allTools,
          activeTools: coreNames,
          prepareStep: revealExtraToolsAfterListTools,
          stopWhen: isStepCount(20),
          instructions: await buildSystemPrompt(),
        });
        const result = await agent.stream({
          messages: await getConversationHistoryWindow(),
        });
        // Forward deltas to the channel while accumulating the full reply to log.
        let reply = "";
        await deliver(
          (async function* () {
            for await (const delta of result.textStream) {
              reply += delta;
              yield delta;
            }
          })(),
        );
        if (reply.trim()) await logMessage("assistant", reply);
      } catch (e: any) {
        console.error("turn failed:", e?.message ?? e);
      }
      await syncReminders();
    });

  // Stop every live job and rebuild from the files on disk.
  const syncReminders = async () => {
    jobs.forEach((job) => job.stop());
    jobs = [];

    const files = (await readdir(remindersDir)).filter((f) =>
      f.endsWith(".yaml"),
    );
    for (const file of files) {
      const path = join(remindersDir, file);
      let reminder;
      try {
        reminder = reminderSchema.parse(
          parseYaml(await readFile(path, "utf8")),
        );
      } catch (e: any) {
        console.error(`reminder ${file} invalid, skipping:`, e?.message ?? e);
        continue;
      }
      // A one-shot whose instant has passed (fired, or missed while down) is deleted, not scheduled.
      const is_past_reminder =
        reminder.type === "absolute" && Date.parse(reminder.at) <= Date.now();
      if (is_past_reminder) {
        await rm(path, { force: true });
        continue;
      }
      const pattern =
        reminder.type === "repeating" ? reminder.cron : reminder.at;
      try {
        jobs.push(
          new Cron(pattern, { timezone: reminder.tz }, () =>
            runTurn(`${REMINDER_PROMPT} ${reminder.prompt}`),
          ),
        );
      } catch (e: any) {
        console.error(
          `reminder ${file} unschedulable, skipping:`,
          e?.message ?? e,
        );
      }
    }
  };

  return { runTurn, syncReminders };
};
