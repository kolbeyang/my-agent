import { autoChatAction, type AutoChatActionFlavor } from "@grammyjs/auto-chat-action";
import { Laminar } from "@lmnr-ai/lmnr";
import { Bot, type Context } from "grammy";
import telegramify from "telegramify-markdown";
import type { Channel } from "./types";

type BotContext = Context & AutoChatActionFlavor;

export const telegram: Channel = {
  name: "telegram",
  start: async (createAgent) => {
    const chatId = Number(process.env.TELEGRAM_CHAT_ID);
    if (!Number.isFinite(chatId)) {
      console.error(
        "TELEGRAM_CHAT_ID is required in telegram mode (your chat id).",
      );
      process.exit(1);
    }
    const bot = new Bot<BotContext>(process.env.TELEGRAM_TOKEN!);
    bot.use(autoChatAction());
    const markdownText = (text: string) =>
      telegramify(text.slice(0, 4096), "escape");
    // Stream the reply: send a first message, edit it (throttled) as deltas
    // arrive, then a final edit rendered as MarkdownV2. Edits use plain text
    // mid-stream so partial/unbalanced markdown can't fail the parse.
    const { runTurn, syncReminders } = createAgent(async (stream) => {
      let buf = "";
      let messageId: number | undefined;
      let lastShown = "";
      let lastEdit = 0;
      const render = async (final: boolean) => {
        const plain = buf.slice(0, 4096);
        if (!plain || (!final && plain === lastShown)) return;
        lastShown = plain;
        try {
          if (messageId === undefined) {
            const m = await bot.api.sendMessage(chatId, plain);
            messageId = m.message_id;
          } else if (final) {
            await bot.api.editMessageText(chatId, messageId, markdownText(buf), {
              parse_mode: "MarkdownV2",
            });
          } else {
            await bot.api.editMessageText(chatId, messageId, plain);
          }
        } catch {
          // Telegram rejects no-op edits / flaky markdown; keep streaming.
        }
      };
      for await (const delta of stream) {
        buf += delta;
        if (Date.now() - lastEdit >= 1200) {
          lastEdit = Date.now();
          await render(false);
        }
      }
      await render(true);
    });
    bot.on("message:text", async (ctx) => {
      if (ctx.chat.id !== chatId) return; // ignore anyone who isn't the owner
      ctx.chatAction = "typing"; // auto-refreshed until the handler returns
      await runTurn(ctx.message.text);
    });
    await syncReminders();
    const shutdown = async () => {
      await bot.stop();
      await Laminar.shutdown();
      process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    bot.start();
  },
};
