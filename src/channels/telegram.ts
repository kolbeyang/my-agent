import {
  autoChatAction,
  type AutoChatActionFlavor,
} from "@grammyjs/auto-chat-action";
import { autoRetry } from "@grammyjs/auto-retry";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { Bot, InputFile, type Context } from "grammy";
import telegramify from "telegramify-markdown";
import type { Agent, Channel } from "../types";

type BotContext = Context & AutoChatActionFlavor;

// Telegram hard-caps a message at 4096 chars; keep headroom for MarkdownV2
// escaping (telegramify can lengthen the text).
const MAX_LEN = 3800;

// Split into <=MAX_LEN pieces, preferring newline boundaries so we don't cut
// mid-word / mid-paragraph.
const chunk = (text: string): string[] => {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > MAX_LEN) {
    let cut = rest.lastIndexOf("\n", MAX_LEN);
    if (cut < MAX_LEN * 0.5) cut = MAX_LEN; // no usable newline — hard cut
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) pieces.push(rest);
  return pieces;
};

export function createTelegram(): Channel {
  const chatId = Number(process.env.TELEGRAM_CHAT_ID);
  if (!Number.isFinite(chatId))
    throw new Error("set TELEGRAM_CHAT_ID env var (your chat id)");
  const bot = new Bot<BotContext>(process.env.TELEGRAM_TOKEN!);
  bot.api.config.use(autoRetry({ maxDelaySeconds: 5, maxRetryAttempts: 3 }));
  bot.api.config.use(apiThrottler());
  bot.use(autoChatAction());
  const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp"];

  // Accumulate the streamed reply, then send it as one (or a few) plain
  // messages via sendMessage. No draft/streaming API — that experimental
  // path left stuck "streaming" drafts in the chat.
  const deliver = async (stream: AsyncIterable<string>) => {
    let text = "";
    for await (const delta of stream) text += delta;
    text = text.trim();
    if (!text) return;
    for (const piece of chunk(text)) {
      try {
        await bot.api.sendMessage(chatId, telegramify(piece, "escape"), {
          parse_mode: "MarkdownV2",
        });
      } catch {
        await bot.api.sendMessage(chatId, piece); // fallback: unformatted
      }
    }
  };
  const sendFile = (absPath: string, caption?: string) => {
    const file = new InputFile(absPath);
    const opts = caption ? { caption } : {};
    const ext = absPath.toLowerCase().split(".").pop() ?? "";
    const sent = IMAGE_EXT.includes(ext)
      ? bot.api.sendPhoto(chatId, file, opts)
      : bot.api.sendDocument(chatId, file, opts);
    return sent.then(() => {});
  };

  const listen = (agent: Agent) => {
    bot.on("message:text", async (ctx) => {
      if (ctx.chat.id !== chatId) return; // ignore non-owner messages
      ctx.chatAction = "typing"; // auto-refreshed until the handler returns
      await agent.runTurn(ctx.message.text, deliver, sendFile);
    });
    const shutdown = async () => {
      await bot.stop();
      process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    bot.catch((err) => console.error("Bot error", err.error));
    bot.start().catch((e) => {
      console.error("Polling died: ", e);
      process.exit(1);
    });
  };

  return { deliver, sendFile, listen };
}
