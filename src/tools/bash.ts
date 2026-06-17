import { tool } from "ai";
import { execa } from "execa";
import { z } from "zod";
import { DATA_DIR } from "../config";
import { truncate } from "./util";

export const bash = tool({
  description:
    "Run a bash command on your computer (working dir = your data dir). Returns stdout, stderr, exitCode; a non-zero exit is returned, not thrown.",
  inputSchema: z.object({ command: z.string() }),
  execute: async ({ command }) => {
    const r = await execa("bash", ["-lc", command], {
      cwd: DATA_DIR,
      timeout: 120_000,
      reject: false,
      maxBuffer: 50_000_000,
    });
    return {
      stdout: truncate(r.stdout ?? ""),
      stderr: truncate(r.stderr ?? ""),
      exitCode: r.exitCode ?? (r.timedOut ? 124 : 1),
    };
  },
});
