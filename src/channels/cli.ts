import { Laminar } from "@lmnr-ai/lmnr";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { Agent, Channel } from "../types";

export function createCli(): Channel {
  const deliver = async (stream: AsyncIterable<string>) => {
    stdout.write("\nAGENT: ");
    for await (const delta of stream) stdout.write(delta);
    stdout.write("\n\n");
  };
  const sendFile = async (absPath: string, caption?: string) => {
    stdout.write(
      `\n[sent file: ${absPath}${caption ? ` — ${caption}` : ""}]\n`,
    );
  };

  const listen = async (agent: Agent) => {
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
      await agent.runTurn(line, deliver, sendFile);
    }
    await Laminar.shutdown();
    process.exit(0);
  };

  return { deliver, sendFile, listen };
}
