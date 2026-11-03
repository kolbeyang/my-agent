import { Laminar, registerAiSdkTelemetry } from "@lmnr-ai/lmnr";

// Called once at startup, before any channel starts a turn. AI SDK v7 picks up
// the global registration for every model call and tool loop step.
export function initializeTelemetry() {
  if (!process.env.LMNR_PROJECT_API_KEY) return;
  registerAiSdkTelemetry({
    laminarOptions: {
      projectApiKey: process.env.LMNR_PROJECT_API_KEY,
      // The SDK also reads LMNR_BASE_URL from the environment. Force HTTP only
      // when explicitly requested (e.g. for a local OTLP/HTTP collector).
      forceHttp: process.env.LMNR_OTLP_HTTP === "true",
    },
  });
}

// CLI exits explicitly; drain the last batch before terminating the process.
export async function shutdownTelemetry() {
  if (process.env.LMNR_PROJECT_API_KEY) await Laminar.shutdown();
}
