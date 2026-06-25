import { Laminar, registerAiSdkTelemetry } from "@lmnr-ai/lmnr";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createAgent } from "./agent";
import { cli } from "./channels/cli";
import { telegram } from "./channels/telegram";
import type { Channel } from "./channels/types";
import { conversationsDir, remindersDir, WORKSPACE_ROOT } from "./config";

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY,
  ...(process.env.LMNR_BASE_URL && {
    baseUrl: process.env.LMNR_BASE_URL,
    httpPort: Number(process.env.LMNR_HTTP_PORT) ?? undefined,
    grpcPort: Number(process.env.LMNR_GRPC_PORT) ?? undefined,
    disableBatch: true,
  }),
});

// AI SDK v7: global telemetry integration replaces the per-call tracer.
registerAiSdkTelemetry();

await mkdir(WORKSPACE_ROOT, { recursive: true });
await mkdir(conversationsDir, { recursive: true });
await mkdir(remindersDir, { recursive: true });

const {
  values: { mode },
} = parseArgs({ options: { mode: { type: "string" } } });

const channels: Record<string, Channel> = {
  [telegram.name]: telegram,
  [cli.name]: cli,
};

const channel = mode ? channels[mode] : undefined;
if (!channel) {
  console.error(`Specify --mode ${Object.keys(channels).join(" or ")}`);
  process.exit(1);
}
await channel.start(createAgent);
