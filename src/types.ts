import { z } from "zod";

export const reminderSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("repeating"), cron: z.string() }),
    z.object({ type: z.literal("absolute"), at: z.string() }),
  ])
  .and(z.object({ prompt: z.string(), tz: z.string().optional() }));

export type Reminder = z.infer<typeof reminderSchema>;
