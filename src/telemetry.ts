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
      // The SDK strips the port from baseUrl before constructing the exporter.
      // Pass it explicitly so local/self-hosted HTTP collectors work.
      httpPort: process.env.LMNR_BASE_URL
        ? Number(new URL(process.env.LMNR_BASE_URL).port) || undefined
        : undefined,
    },
  });
}

// CLI exits explicitly; drain the last batch before terminating the process.
export async function shutdownTelemetry() {
  if (process.env.LMNR_PROJECT_API_KEY) await Laminar.shutdown();
}
