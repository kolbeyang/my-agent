import { registerAiSdkTelemetry } from "@lmnr-ai/lmnr";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createAgent } from "./agent";
import { createCli } from "./channels/cli";
import { createHttp } from "./channels/http";
import { createTelegram } from "./channels/telegram";
import { conversationsDir, remindersDir, WORKSPACE_ROOT } from "./config";

// AI SDK v7: register before the first model call. During Harbor trials the
// Laminar SDK writes spans to LMNR_TRAJECTORY_PATH instead of exporting them.
registerAiSdkTelemetry();

await mkdir(WORKSPACE_ROOT, { recursive: true });
await mkdir(conversationsDir, { recursive: true });
await mkdir(remindersDir, { recursive: true });

const { values } = parseArgs({
  options: {
    telegram: { type: "boolean" },
    cli: { type: "boolean" },
    http: { type: "boolean" },
  },
});

const telegram = values.telegram ? createTelegram() : undefined;
const cli = values.cli ? createCli() : undefined;
const http = values.http ? createHttp() : undefined;
const channels = [telegram, cli, http].filter((c) => c !== undefined);

if (channels.length === 0) {
  console.error("pass at least one of --telegram --cli --http");
  process.exit(1);
}

// Reminders have no channel of their own — deliver them to telegram/cli.
const primary = telegram ?? cli;
if (!primary) console.warn("no --telegram/--cli: reminders have nowhere to go");
const noop = async () => {};

const agent = createAgent(primary?.deliver ?? noop, primary?.sendFile ?? noop);
await agent.syncReminders();
for (const channel of channels) channel.listen(agent);
