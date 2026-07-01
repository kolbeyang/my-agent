import { z } from "zod";

export type Agent = {
  runTurn: (
    message: string,
    deliver: Deliver,
    sendFile: SendFile,
  ) => Promise<void>;
  syncReminders: () => Promise<void>;
};
export type Deliver = (stream: AsyncIterable<string>) => Promise<void>;

export const reminderSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("repeating"), cron: z.string() }),
    z.object({ type: z.literal("absolute"), at: z.string() }),
  ])
  .and(z.object({ prompt: z.string(), tz: z.string().optional() }));

export type Reminder = z.infer<typeof reminderSchema>;

export type SendFile = (
  absolutePath: string,
  caption?: string,
) => Promise<void>;

export type Channel = {
  deliver?: Deliver;
  sendFile?: SendFile;
  listen(agent: Agent): Promise<void> | void;
};
