import { Laminar } from "@lmnr-ai/lmnr";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { Channel } from "./types";

export const cli: Channel = {
  name: "cli",
  start: async (createAgent) => {
    const { runTurn, syncReminders } = createAgent(
      async (stream) => {
        stdout.write("\nAGENT: ");
        for await (const delta of stream) stdout.write(delta);
        stdout.write("\n\n");
      },
      async (absPath, caption) => {
        stdout.write(`\n[image: ${absPath}${caption ? ` — ${caption}` : ""}]\n`);
      },
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
  },
};
