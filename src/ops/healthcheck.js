import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { repairNodePtySpawnHelperPermissions } from "../runner/ptyPreflight.js";
import { extractCodexExecResponse } from "../bot/formatter.js";

function makeCheck(name, status, detail) {
  return { name, status, detail };
}

function isPathExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveCommandPath(command, env = process.env) {
  const raw = String(command || "").trim();
  if (!raw) return "";

  if (raw.includes(path.sep)) {
    const candidate = path.resolve(raw);
    return isPathExecutable(candidate) ? candidate : "";
  }

  const pathValue = String(env.PATH || "");
  for (const segment of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(segment, raw);
    if (isPathExecutable(candidate)) {
      return candidate;
    }
  }

  return "";
}

function checkDirectory(name, directoryPath) {
  if (!directoryPath) {
    return makeCheck(name, "fail", "Path is empty.");
  }

  if (!fs.existsSync(directoryPath)) {
    return makeCheck(name, "fail", `Missing directory: ${directoryPath}`);
  }

  if (!fs.statSync(directoryPath).isDirectory()) {
    return makeCheck(name, "fail", `Expected a directory: ${directoryPath}`);
  }

  return makeCheck(name, "pass", directoryPath);
}

function checkWritableDirectory(name, directoryPath) {
  const base = checkDirectory(name, directoryPath);
  if (base.status !== "pass") return base;

  try {
    fs.accessSync(directoryPath, fs.constants.W_OK);
    return base;
  } catch (error) {
    return makeCheck(
      name,
      "fail",
      `Directory is not writable: ${directoryPath} (${error.message})`
    );
  }
}

function runCliCodexLiveCheck(config) {
  return new Promise((resolve, reject) => {
    const prompt = "Reply with exactly: HEALTHCHECK_OK";
    const proc = spawn(
      config.runner.command,
      [...(config.runner.args || []), "exec", prompt],
      {
        cwd: config.runner.cwd,
        env: process.env
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    proc.on("error", reject);
    proc.on("close", (code, signal) => {
      const output = extractCodexExecResponse(`${stdout}\n${stderr}`).trim();
      if (code !== 0) {
        reject(
          new Error(
            `CLI health check exited with code ${code}, signal ${signal || "none"}`
          )
        );
        return;
      }

      if (output !== "HEALTHCHECK_OK") {
        reject(
          new Error(`Unexpected CLI response: ${output || "(empty output)"}`)
        );
        return;
      }

      resolve({
        backend: "cli",
        output
      });
    });
  });
}

async function runSdkCodexLiveCheck(config) {
  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex({
    config: config.runner.sdkConfig
  });
  const thread = codex.startThread({
    workingDirectory: config.runner.cwd,
    skipGitRepoCheck: config.runner.sdkThreadOptions.skipGitRepoCheck,
    approvalPolicy: config.runner.sdkThreadOptions.approvalPolicy,
    sandboxMode: config.runner.sdkThreadOptions.sandboxMode,
    modelReasoningEffort: config.runner.sdkThreadOptions.modelReasoningEffort,
    networkAccessEnabled: config.runner.sdkThreadOptions.networkAccessEnabled,
    webSearchMode: config.runner.sdkThreadOptions.webSearchMode,
    additionalDirectories: config.runner.sdkThreadOptions.additionalDirectories
  });
  const turn = await thread.run("Reply with exactly: HEALTHCHECK_OK");

  if (turn.finalResponse.trim() !== "HEALTHCHECK_OK") {
    throw new Error(
      `Unexpected SDK response: ${turn.finalResponse.trim() || "(empty output)"}`
    );
  }

  return {
    backend: "sdk",
    threadId: thread.id,
    output: turn.finalResponse.trim()
  };
}

async function runCodexLiveCheck(config, options = {}) {
  if (typeof options.codexLiveRunner === "function") {
    return options.codexLiveRunner(config);
  }

  if (config.runner.backend === "sdk") {
    return runSdkCodexLiveCheck(config);
  }

  return runCliCodexLiveCheck(config);
}

export async function runHealthcheck(config, options = {}) {
  const strict = Boolean(options.strict);
  const env = options.env || process.env;
  const checks = [];

  checks.push(checkDirectory("workspace root", config.workspace.root));
  checks.push(checkDirectory("runner workdir", config.runner.cwd));
  checks.push(checkDirectory("github workdir", config.github.defaultWorkdir));
  checks.push(
    checkWritableDirectory(
      "state file directory",
      path.dirname(config.app.stateFile)
    )
  );

  const resolvedCommand = resolveCommandPath(config.runner.command, env);
  checks.push(
    resolvedCommand
      ? makeCheck(
          "codex command",
          "pass",
          `${config.runner.command} -> ${resolvedCommand}`
        )
      : makeCheck(
          "codex command",
          strict ? "fail" : "warn",
          `Command not found in PATH: ${config.runner.command}`
        )
  );

  const ptyHelper = repairNodePtySpawnHelperPermissions();
  if (ptyHelper.error) {
    checks.push(
      makeCheck("node-pty helper", strict ? "fail" : "warn", ptyHelper.error)
    );
  } else if (ptyHelper.changed) {
    checks.push(
      makeCheck(
        "node-pty helper",
        "pass",
        `Repaired execute permissions: ${ptyHelper.path}`
      )
    );
  } else {
    checks.push(makeCheck("node-pty helper", "pass", ptyHelper.path));
  }

  const liveTelegramCheck = Boolean(options.telegramLiveCheck);
  if (liveTelegramCheck) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${config.telegram.botToken}/getMe`
      );
      const payload = await response.json();
      if (response.ok && payload?.ok && payload?.result?.username) {
        checks.push(
          makeCheck(
            "telegram api",
            "pass",
            `Authenticated as @${payload.result.username}`
          )
        );
      } else {
        checks.push(
          makeCheck(
            "telegram api",
            "fail",
            payload?.description || `HTTP ${response.status}`
          )
        );
      }
    } catch (error) {
      checks.push(makeCheck("telegram api", "fail", error.message));
    }
  }

  const codexLiveCheck = Boolean(options.codexLiveCheck);
  if (codexLiveCheck) {
    try {
      const result = await runCodexLiveCheck(config, options);
      checks.push(
        makeCheck(
          "codex live",
          "pass",
          `${result.backend} backend responded with ${result.output}${
            result.threadId ? ` (thread ${result.threadId})` : ""
          }`
        )
      );
    } catch (error) {
      checks.push(
        makeCheck(
          "codex live",
          "fail",
          error instanceof Error ? error.message : String(error)
        )
      );
    }
  }

  const failed = checks.filter((check) => check.status === "fail");
  const warned = checks.filter((check) => check.status === "warn");

  return {
    ok: failed.length === 0 && (strict ? warned.length === 0 : true),
    checks
  };
}
