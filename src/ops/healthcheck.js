import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { repairNodePtySpawnHelperPermissions } from "../runner/ptyPreflight.js";

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

  const failed = checks.filter((check) => check.status === "fail");
  const warned = checks.filter((check) => check.status === "warn");

  return {
    ok: failed.length === 0 && (strict ? warned.length === 0 : true),
    checks
  };
}
