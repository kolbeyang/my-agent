# Memory recall environment eval

Two isolated cases run the production HTTP `POST /ask` entry point against the real agent and Anthropic model. Both ask the same question; only the private preloaded memory and reference answer differ. The verifier checks the returned answer against the case's expected sailboat name. No third-party service is mocked: Telegram, Tavily and Composio aren't used by these cases. Each case gets its own filesystem and process; the model is real and requires `ANTHROPIC_API_KEY`.

From the repo root, set `ANTHROPIC_API_KEY` and `LMNR_PROJECT_API_KEY`, then run `npx -y lmnr-cli@latest eval run evals`; use `--remote` to run on Laminar. Copy a task folder to add a case, change `environment/case.json` and `tests/expected.json`, and run it. Keep answers only in `tests/`.

The application does not emit Laminar spans, and its conversation log contains just user and final assistant turns, not model/tool steps. Trial details therefore contain the HTTP reply and reward, but not an LLM/tool trajectory. Instrument the app separately to make these visible.
