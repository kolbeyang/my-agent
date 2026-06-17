import { Laminar } from "@lmnr-ai/lmnr";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { CreateAgent } from "../agent";

// Local REPL for testing — type messages, "exit" to quit.
export const startCli = async (createAgent: CreateAgent) => {
  const { runTurn, syncReminders } = createAgent(async (text) =>
    console.log(`\nAGENT: ${text}\n`),
  );
  await syncReminders();
  const rl = createInterface({ input: stdin, output: stdout });
  while (true) {
    let line: string;
    try {
      line = (await rl.question("USER: ")).trim();
    } catch {
      break;
    }
    if (line === "exit") break;
    if (!line) continue;
    await runTurn(line);
  }
  await Laminar.shutdown();
  process.exit(0);
};
