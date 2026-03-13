import { spawn } from "node:child_process";
import process from "node:process";
import pty from "node-pty";
import throttle from "lodash.throttle";
import stripAnsi from "strip-ansi";
import { formatPtyOutput, splitTelegramMessage } from "../bot/formatter.js";

function isMessageNotModified(error) {
  return String(error?.description || error?.message || "").includes("message is not modified");
}

function isPtySpawnFailure(error) {
  return String(error?.message || "").includes("posix_spawnp failed");
}

export class PtyManager {
  constructor({ bot, config }) {
    this.bot = bot;
    this.config = config;
    this.sessions = new Map();
  }

  createBaseSession(chatId, mode) {
    const key = String(chatId);
    const session = {
      chatId: key,
      mode,
      proc: null,
      rawBuffer: "",
      streamMessageIds: [],
      lastRendered: "",
      flushQueue: Promise.resolve(),
      throttledFlush: null,
      write: null,
      interrupt: null,
      close: null
    };

    session.throttledFlush = throttle(
      () => this.enqueueFlush(key),
      this.config.runner.throttleMs,
      { leading: true, trailing: true }
    );

    this.sessions.set(key, session);
    return session;
  }

  attachOutput(session, stream) {
    stream.on("data", (chunk) => {
      session.rawBuffer += stripAnsi(String(chunk || "")).replace(/\r/g, "");
      if (session.rawBuffer.length > this.config.runner.maxBufferChars) {
        session.rawBuffer = session.rawBuffer.slice(-this.config.runner.maxBufferChars);
      }
      session.throttledFlush();
    });
  }

  attachExit(session, handler) {
    handler(async ({ exitCode, signal }) => {
      this.enqueueFlush(session.chatId);
      await this.bot.telegram
        .sendMessage(
          session.chatId,
          `Codex session exited (mode=${session.mode}, code=${exitCode}, signal=${signal}).`
        )
        .catch(() => {});
      session.throttledFlush?.cancel();
      this.sessions.delete(session.chatId);
    });
  }

  startPtySession(chatId) {
    const session = this.createBaseSession(chatId, "pty");
    const proc = pty.spawn(this.config.runner.command, this.config.runner.args, {
      name: "xterm-256color",
      cols: 120,
      rows: 32,
      cwd: this.config.runner.cwd,
      env: {
        ...process.env,
        FORCE_COLOR: "1"
      }
    });

    session.proc = proc;
    session.write = (input) => proc.write(input);
    session.interrupt = () => proc.write("\u0003");
    session.close = () => proc.kill();

    proc.onData((chunk) => {
      session.rawBuffer += stripAnsi(String(chunk || "")).replace(/\r/g, "");
      if (session.rawBuffer.length > this.config.runner.maxBufferChars) {
        session.rawBuffer = session.rawBuffer.slice(-this.config.runner.maxBufferChars);
      }
      session.throttledFlush();
    });

    this.attachExit(session, (listener) => proc.onExit(listener));
    return session;
  }

  startExecSession(chatId, prompt) {
    const session = this.createBaseSession(chatId, "exec");
    const proc = spawn(
      this.config.runner.command,
      [...this.config.runner.args, "exec", prompt],
      {
        cwd: this.config.runner.cwd,
        env: process.env
      }
    );

    session.proc = proc;
    session.write = null;
    session.interrupt = () => proc.kill("SIGINT");
    session.close = () => proc.kill("SIGTERM");

    this.attachOutput(session, proc.stdout);
    this.attachOutput(session, proc.stderr);
    this.attachExit(session, (listener) =>
      proc.on("close", (exitCode, signal) => listener({ exitCode, signal }))
    );

    proc.on("error", async (error) => {
      await this.bot.telegram
        .sendMessage(session.chatId, `Codex exec failed: ${error.message}`)
        .catch(() => {});
      session.throttledFlush?.cancel();
      this.sessions.delete(session.chatId);
    });

    return session;
  }

  ensureSession(chatId) {
    const key = String(chatId);
    const existing = this.sessions.get(key);
    if (existing) return existing;

    try {
      return this.startPtySession(key);
    } catch (error) {
      if (!isPtySpawnFailure(error)) {
        throw error;
      }

      console.warn(`[runner] PTY spawn failed for chat ${key}; falling back to codex exec mode.`);
      return null;
    }
  }

  enqueueFlush(chatId) {
    const key = String(chatId);
    const session = this.sessions.get(key);
    if (!session) return;

    session.flushQueue = session.flushQueue
      .then(() => this.flushToTelegram(key))
      .catch(() => {});
  }

  async flushToTelegram(chatId) {
    const session = this.sessions.get(chatId);
    if (!session) return;

    const rawTail = session.rawBuffer.slice(-60000);
    const rendered = formatPtyOutput(rawTail, { mode: this.config.reasoning.mode });
    if (rendered === session.lastRendered) return;
    session.lastRendered = rendered;

    const chunks = splitTelegramMessage(rendered, this.config.runner.telegramChunkSize);
    const existing = session.streamMessageIds;
    const nextIds = [];

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const existingMessageId = existing[i];

      if (existingMessageId) {
        try {
          await this.bot.telegram.editMessageText(chatId, existingMessageId, undefined, chunk, {
            parse_mode: "MarkdownV2",
            disable_web_page_preview: true
          });
          nextIds.push(existingMessageId);
        } catch (error) {
          if (!isMessageNotModified(error)) {
            const sent = await this.bot.telegram.sendMessage(chatId, chunk, {
              parse_mode: "MarkdownV2",
              disable_web_page_preview: true
            });
            nextIds.push(sent.message_id);
          } else {
            nextIds.push(existingMessageId);
          }
        }
      } else {
        const sent = await this.bot.telegram.sendMessage(chatId, chunk, {
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true
        });
        nextIds.push(sent.message_id);
      }
    }

    for (let i = chunks.length; i < existing.length; i += 1) {
      const staleId = existing[i];
      await this.bot.telegram.deleteMessage(chatId, staleId).catch(() => {});
    }

    session.streamMessageIds = nextIds;
  }

  async sendPrompt(ctx, prompt) {
    const chatId = String(ctx.chat.id);
    let session = this.ensureSession(chatId);

    if (!session) {
      session = this.startExecSession(chatId, prompt);
      await this.bot.telegram.sendMessage(
        chatId,
        "PTY unavailable on this host. Falling back to `codex exec` mode for this request."
      );
      return;
    }

    if (!session.streamMessageIds.length) {
      const sent = await this.bot.telegram.sendMessage(
        chatId,
        `Codex session started (${session.mode}). Streaming output...`
      );
      session.streamMessageIds.push(sent.message_id);
    }

    if (session.mode === "exec") {
      await this.bot.telegram.sendMessage(
        chatId,
        "A Codex exec task is already running. Wait for it to finish or use /interrupt."
      );
      return;
    }

    session.write(`${prompt}\r`);
  }

  interrupt(chatId) {
    const session = this.sessions.get(String(chatId));
    if (!session) return false;
    session.interrupt?.();
    return true;
  }

  closeSession(chatId) {
    const key = String(chatId);
    const session = this.sessions.get(key);
    if (!session) return false;

    session.throttledFlush?.cancel();
    session.close?.();
    this.sessions.delete(key);
    return true;
  }

  async shutdown() {
    for (const chatId of this.sessions.keys()) {
      this.closeSession(chatId);
    }
  }
}
