import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCommandPath, runHealthcheck } from "../src/ops/healthcheck.js";

function createConfig(root) {
  return {
    app: {
      stateFile: path.join(root, ".codex-telegram-claws-state.json")
    },
    workspace: {
      root
    },
    telegram: {
      botToken: "dummy-token"
    },
    runner: {
      command: "node",
      cwd: root
    },
    github: {
      defaultWorkdir: root
    }
  };
}

test("resolveCommandPath finds a binary from PATH", () => {
  const resolved = resolveCommandPath("node", process.env);

  assert.ok(resolved);
  assert.match(resolved, /node$/);
});

test("runHealthcheck passes for a valid local config", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);

  const result = await runHealthcheck(config, {
    env: process.env
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.some((check) => check.status === "fail"),
    false
  );
});

test("runHealthcheck warns when the configured command is missing in non-strict mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);
  config.runner.command = "definitely-not-a-real-command";

  const result = await runHealthcheck(config, {
    env: process.env
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.checks.some((check) => check.status === "warn"),
    true
  );
});

test("runHealthcheck fails when the configured command is missing in strict mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claws-health-"));
  const config = createConfig(root);
  config.runner.command = "definitely-not-a-real-command";

  const result = await runHealthcheck(config, {
    env: process.env,
    strict: true
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.some((check) => check.status === "fail"),
    true
  );
});
