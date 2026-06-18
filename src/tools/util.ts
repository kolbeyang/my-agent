export const MAX_OUTPUT = 30_000; // cap tool output so it doesn't blow the context window

export const truncate = (s: string) =>
  s.length <= MAX_OUTPUT
    ? s
    : `${s.slice(0, MAX_OUTPUT / 2)}\n…[truncated ${s.length - MAX_OUTPUT} chars]…\n${s.slice(-MAX_OUTPUT / 2)}`;

export const tailTruncate = (
  s: string,
  max = MAX_OUTPUT,
): { text: string; omitted: number } =>
  s.length <= max
    ? { text: s, omitted: 0 }
    : { text: s.slice(s.length - max), omitted: s.length - max };
