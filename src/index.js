import { Telegraf } from "telegraf";
import { loadConfig } from "./config.js";
import { RuntimeStateStore } from "./runtimeStateStore.js";
import { createAuthMiddleware } from "./bot/middleware.js";
import { registerHandlers } from "./bot/handlers.js";
import { Router } from "./orchestrator/router.js";
import { McpClient } from "./orchestrator/mcpClient.js";
import { SkillRegistry } from "./orchestrator/skillRegistry.js";
import { McpSkill } from "./orchestrator/skills/mcpSkill.js";
import { GitHubSkill } from "./orchestrator/skills/githubSkill.js";
import { PtyManager } from "./runner/ptyManager.js";
import { ShellManager } from "./runner/shellManager.js";
import { Scheduler } from "./cron/scheduler.js";

const config = loadConfig();
const bot = new Telegraf(config.telegram.botToken, {
  handlerTimeout: 120000
});
const stateStore = new RuntimeStateStore({ config });
let mcpClient;
let skillRegistry;

async function saveRuntimeState() {
  if (!mcpClient || !skillRegistry) return;
  await stateStore.save({
    mcp: mcpClient.exportState(),
    skills: skillRegistry.exportState()
  });
}

bot.use(createAuthMiddleware(config));

const runtimeState = await stateStore.load();
mcpClient = new McpClient(config, {
  onChange: () => void saveRuntimeState()
});
mcpClient.restoreState(runtimeState.mcp);
await mcpClient.connectAll().catch((error) => {
  console.error("[mcp] connect failed:", error.message);
});

const githubSkill = new GitHubSkill({ config });
const mcpSkill = new McpSkill({ mcpClient });
const skills = {
  github: githubSkill,
  mcp: mcpSkill
};
skillRegistry = new SkillRegistry(skills, {
  onChange: () => void saveRuntimeState()
});
skillRegistry.restoreState(runtimeState.skills);

const router = new Router({
  skills,
  isSkillEnabled: (chatId, skillName) => skillRegistry.isEnabled(chatId, skillName)
});

const ptyManager = new PtyManager({
  bot,
  config
});
const shellManager = new ShellManager({
  config
});

const scheduler = new Scheduler({
  bot,
  config
});
scheduler.start();

registerHandlers({
  bot,
  router,
  ptyManager,
  shellManager,
  skills,
  skillRegistry,
  scheduler
});

bot.catch(async (error, ctx) => {
  console.error("[bot] unhandled error:", error);
  await ctx.reply(`Bot error: ${error.message}`).catch(() => {});
});

await bot.launch();
console.log("codex-telegram-claws started.");

async function shutdown(signal) {
  console.log(`Shutting down by ${signal}...`);
  scheduler.stop();
  await ptyManager.shutdown();
  await mcpClient.closeAll();
  bot.stop(signal);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
