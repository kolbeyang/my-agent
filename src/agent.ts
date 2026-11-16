import { createAzure } from "@ai-sdk/azure";
import { wrapLanguageModel } from "@lmnr-ai/lmnr";
import { gateway as aiGateway, isStepCount, ToolLoopAgent } from "ai";
import { Mutex } from "async-mutex";
import { Cron } from "croner";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { remindersDir } from "./config";
import { getConversationHistoryWindow, logMessage } from "./conversations";
import { buildSystemPrompt, REMINDER_PROMPT } from "./prompts";
import { coreTools, MyAgentTools, tools } from "./tools";
import { type Deliver, reminderSchema, type SendFile } from "./types";

// Keep the existing gateway default; evals opt into Azure's GPT-6-Sol deployment.
const createModel = () => {
  if (process.env.LLM_PROVIDER !== "azure") {
    return aiGateway("deepseek/deepseek-v4-pro");
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const resourceName = process.env.AZURE_RESOURCE_NAME;
  const apiKey = process.env.AZURE_OPENAI_API_KEY ?? process.env.AZURE_API_KEY;
  if ((!endpoint && !resourceName) || !apiKey) {
    throw new Error(
      "Azure requires AZURE_OPENAI_ENDPOINT or AZURE_RESOURCE_NAME, and AZURE_OPENAI_API_KEY or AZURE_API_KEY",
    );
  }

  // @ai-sdk/azure 4.0.0 appends /v1 to baseURL. Azure's usual endpoint is
  // the resource root; accept that as well as /openai and /openai/v1 URLs.
  let baseURL: string | undefined;
  if (endpoint) {
    const url = new URL(endpoint);
    const path = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
    url.pathname = path || "/openai";
    baseURL = url.toString().replace(/\/+$/, "");
  }
  const azure = createAzure({
    ...(baseURL ? { baseURL } : { resourceName }),
    apiKey,
    ...(process.env.AZURE_OPENAI_API_VERSION
      ? { apiVersion: process.env.AZURE_OPENAI_API_VERSION }
      : {}),
  });
  return azure.responses(process.env.AZURE_OPENAI_DEPLOYMENT || "GPT-6-Sol");
};

const model = wrapLanguageModel(createModel());

const revealExtraToolsAfterListTools = ({ steps }: { steps: any[] }) => {
  const calledListTools = steps.some((s) =>
    s.toolCalls.some((c: any) => c.toolName === "list_tools"),
  );
  const active = Object.keys(calledListTools ? tools : coreTools);
  return { activeTools: active };
};

export const createAgent = (
  reminderDeliver: Deliver,
  reminderSendFile: SendFile,
) => {
  const lock = new Mutex();
  let jobs: Cron[] = [];

  const runTurn = (message: string, deliver: Deliver, sendFile: SendFile) =>
    lock.runExclusive(async () => {
      const start = Date.now();
      console.log("turn start");
      try {
        await logMessage("user", message);
        const agent = new ToolLoopAgent<never, MyAgentTools>({
          model,
          tools: tools,
          activeTools: Object.keys(coreTools),
          prepareStep: revealExtraToolsAfterListTools,
          stopWhen: isStepCount(100),
          instructions: await buildSystemPrompt(),
          toolsContext: { send_file: { sendFile } },
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
      console.log(`turn done in ${Date.now() - start}ms`);
    });

  const syncReminders = async () => {
    jobs.forEach((job) => job.stop());
    jobs = [];

    for (const fileName of await readdir(remindersDir)) {
      const path = join(remindersDir, fileName);

      let reminder;
      try {
        reminder = reminderSchema.parse(
          parseYaml(await readFile(path, "utf8")),
        );
      } catch (e: any) {
        const message = `reminder ${fileName} invalid, skipping:`;
        console.error(message, e?.message ?? e);
        continue;
      }

      const is_past_reminder =
        reminder.type === "absolute" && Date.parse(reminder.at) <= Date.now();
      if (is_past_reminder) {
        await rm(path, { force: true });
        continue;
      }

      const pattern =
        reminder.type === "repeating" ? reminder.cron : reminder.at;
      try {
        const cronFunction = () =>
          runTurn(
            `${REMINDER_PROMPT} ${reminder.prompt}`,
            reminderDeliver,
            reminderSendFile,
          );
        jobs.push(new Cron(pattern, { timezone: reminder.tz }, cronFunction));
      } catch (e: any) {
        const message = `reminder ${fileName} unschedulable, skipping:`;
        console.error(message, e?.message ?? e);
      }
    }
  };

  return { runTurn, syncReminders };
};
