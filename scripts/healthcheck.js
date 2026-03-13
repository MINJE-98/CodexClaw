import process from "node:process";
import { loadConfig } from "../src/config.js";
import { runHealthcheck } from "../src/ops/healthcheck.js";

const strict = process.argv.includes("--strict");
const telegramLiveCheck = process.argv.includes("--telegram-live");

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`[FAIL] config: ${error.message}`);
  process.exit(1);
}

const result = await runHealthcheck(config, {
  strict,
  telegramLiveCheck
});

for (const check of result.checks) {
  console.log(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
}

process.exit(result.ok ? 0 : 1);
