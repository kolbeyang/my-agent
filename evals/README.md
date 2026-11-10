# Memory recall environment eval

Two isolated cases run the production HTTP `POST /ask` entry point against the real agent and Anthropic model. Both ask the same question; only the private preloaded memory and reference answer differ. The verifier checks the returned answer against the case's expected sailboat name. No third-party service is mocked: Telegram, Tavily and Composio aren't used by these cases. Each case gets its own filesystem and process; the model is real and requires `ANTHROPIC_API_KEY`.

From the repo root, set `ANTHROPIC_API_KEY` and `LMNR_PROJECT_API_KEY`, then run `npx -y lmnr-cli@latest eval run evals`; use `--remote` to run on Laminar. Copy a task folder to add a case, change `environment/case.json` and `tests/expected.json`, and run it. Keep answers only in `tests/`.

The application registers Laminar's AI SDK v7 telemetry at startup. During a Harbor run, `LMNR_TRAJECTORY_PATH` is forwarded into the HTTP server, which flushes after answering so Harbor can attach the model and tool spans under the trial's agent span. No Laminar project key or Laminar network access is needed inside the eval container. Outside Harbor, set `LMNR_PROJECT_API_KEY` to send production spans to your Laminar project.
