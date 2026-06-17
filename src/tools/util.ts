export const MAX_OUTPUT = 30_000; // cap tool output so it doesn't blow the context window
export const truncate = (s: string) =>
  s.length <= MAX_OUTPUT
    ? s
    : `${s.slice(0, MAX_OUTPUT / 2)}\n…[truncated ${s.length - MAX_OUTPUT} chars]…\n${s.slice(-MAX_OUTPUT / 2)}`;
