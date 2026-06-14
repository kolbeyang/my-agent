import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

// Host-side git sync of the data dir to a private remote. The agent's own bash
// is a sandboxed simulator (just-bash) and can't run git, so the HOST owns sync:
//   - init()  on boot: set up the deploy key, ensure the repo, pull external edits
//   - push()  after each turn: commit + push (best-effort; never throws)
// Opt-in via MEMORY_REPO; a no-op when unset (local dev without a remote).
export const createMemoryGit = (dataDir: string) => {
  const repo = process.env.MEMORY_REPO;
  if (!repo) return { init: async () => {}, push: async (_message: string) => {} };

  const keyPath = join(homedir(), ".ssh", "id_memory");
  const env = {
    ...process.env,
    // Only override SSH when we were handed a deploy key (prod). Locally, git
    // falls back to the user's own credentials.
    ...(process.env.MEMORY_DEPLOY_KEY && {
      GIT_SSH_COMMAND: `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`,
    }),
  };
  const git = (...args: string[]) =>
    exec("git", ["-C", dataDir, ...args], { env });

  const push = async (message: string) => {
    try {
      await git("add", "-A");
      await git("commit", "-m", message).catch(() => {}); // no-op if unchanged
      await git("push", "origin", "HEAD:main");
    } catch (e: any) {
      console.error("memory sync (push) failed:", e?.message ?? e);
    }
  };

  const init = async () => {
    if (process.env.MEMORY_DEPLOY_KEY) {
      await mkdir(join(homedir(), ".ssh"), { recursive: true });
      await writeFile(keyPath, `${process.env.MEMORY_DEPLOY_KEY.trim()}\n`, {
        mode: 0o600,
      });
    }
    try {
      await git("rev-parse", "--is-inside-work-tree");
    } catch {
      await git("init");
      await git("remote", "add", "origin", repo);
      await git("config", "user.name", "harry");
      await git("config", "user.email", "harry@my-agent");
      await git("branch", "-M", "main");
    }
    // Pull external edits; prefer the pushed version on the rare conflict.
    try {
      await git("fetch", "origin");
      await git("pull", "--no-edit", "--no-rebase", "-X", "theirs", "origin", "main");
    } catch {
      // empty remote (first boot) or nothing to pull — this push seeds it
    }
    // Seed/back up the current state immediately, so a deploy doesn't wait for
    // the first turn to persist anything.
    await push("boot sync");
  };

  return { init, push };
};
