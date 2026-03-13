import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

export type ReasoningMode = "quote" | "spoiler";

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface AppConfig {
  app: {
    name: string;
    stateFile: string;
  };
  workspace: {
    root: string;
  };
  telegram: {
    botToken: string;
    allowedUserIds: string[];
    proactiveUserIds: string[];
  };
  runner: {
    command: string;
    args: string[];
    cwd: string;
    throttleMs: number;
    maxBufferChars: number;
    telegramChunkSize: number;
  };
  reasoning: {
    mode: ReasoningMode;
  };
  shell: {
    enabled: boolean;
    readOnly: boolean;
    allowedCommands: string[];
    dangerousCommands: string[];
    timeoutMs: number;
    maxOutputChars: number;
  };
  cron: {
    dailySummary: string;
    timezone: string;
  };
  mcp: {
    servers: McpServerConfig[];
  };
  github: {
    token: string;
    defaultWorkdir: string;
    defaultBranch: string;
    e2eCommand: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseArgs(value: string): string[] {
  if (!value.trim()) return [];
  const parts = value.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return parts.map((part) => part.replace(/^"|"$/g, ""));
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in environment variable: ${message}`);
  }
}

function resolveDirectory(
  value: string | undefined,
  name: string,
  fallback = process.cwd()
): string {
  const resolvedFallback = path.resolve(fallback);
  const candidate = path.resolve(value || resolvedFallback);

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return candidate;
  }

  if (value && value.trim()) {
    console.warn(
      `[config] ${name} does not exist: ${candidate}. Falling back to ${resolvedFallback}`
    );
  }

  return resolvedFallback;
}

function resolveFile(value: string | undefined, fallback: string): string {
  const candidate = path.resolve(value || fallback);
  const directory = path.dirname(candidate);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return candidate;
}

function normalizeEnvMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, String(value)])
  );
}

function normalizeMcpServer(
  raw: unknown,
  index: number
): McpServerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as {
    name?: unknown;
    command?: unknown;
    args?: unknown;
    cwd?: unknown;
    env?: unknown;
  };

  if (!candidate.name || !candidate.command) {
    throw new Error(
      `Invalid MCP server config at index ${index}: "name" and "command" are required.`
    );
  }

  return {
    name: String(candidate.name),
    command: String(candidate.command),
    args: Array.isArray(candidate.args) ? candidate.args.map(String) : [],
    cwd: resolveDirectory(
      candidate.cwd ? String(candidate.cwd) : process.cwd(),
      `MCP_SERVERS[${index}].cwd`
    ),
    env: normalizeEnvMap(candidate.env)
  };
}

export function loadConfig(): AppConfig {
  const allowedUserIds = parseCsv(process.env.ALLOWED_USER_IDS);
  if (!allowedUserIds.length) {
    throw new Error(
      "ALLOWED_USER_IDS must contain at least one Telegram user id."
    );
  }

  const proactiveUserIds = parseCsv(
    process.env.PROACTIVE_USER_IDS || process.env.ALLOWED_USER_IDS
  );
  const rawMcpServers = parseJson<unknown[]>(process.env.MCP_SERVERS, []);
  const mcpServers = Array.isArray(rawMcpServers)
    ? rawMcpServers
        .map((server, index) => normalizeMcpServer(server, index))
        .filter((server): server is McpServerConfig => Boolean(server))
    : [];
  const runnerCwd = resolveDirectory(
    process.env.CODEX_WORKDIR,
    "CODEX_WORKDIR"
  );
  const workspaceRoot = resolveDirectory(
    process.env.WORKSPACE_ROOT,
    "WORKSPACE_ROOT",
    runnerCwd
  );
  const githubDefaultWorkdir = resolveDirectory(
    process.env.GITHUB_DEFAULT_WORKDIR,
    "GITHUB_DEFAULT_WORKDIR"
  );
  const rawShellAllowedCommands = parseJson<unknown[]>(
    process.env.SHELL_ALLOWED_COMMANDS,
    []
  );
  const shellAllowedCommands = Array.isArray(rawShellAllowedCommands)
    ? rawShellAllowedCommands
        .map((value) => String(value).trim())
        .filter(Boolean)
    : [];
  const rawShellDangerousCommands = parseJson<unknown[]>(
    process.env.SHELL_DANGEROUS_COMMANDS,
    []
  );
  const shellDangerousCommands = Array.isArray(rawShellDangerousCommands)
    ? rawShellDangerousCommands
        .map((value) => String(value).trim())
        .filter(Boolean)
    : [];
  const shellEnabled = parseBoolean(process.env.SHELL_ENABLED, false);

  if (shellEnabled && !shellAllowedCommands.length) {
    throw new Error(
      "SHELL_ALLOWED_COMMANDS must contain at least one command prefix when SHELL_ENABLED=true."
    );
  }

  return {
    app: {
      name: "codex-telegram-claws",
      stateFile: resolveFile(
        process.env.STATE_FILE,
        path.join(process.cwd(), ".codex-telegram-claws-state.json")
      )
    },
    workspace: {
      root: workspaceRoot
    },
    telegram: {
      botToken: required("BOT_TOKEN"),
      allowedUserIds,
      proactiveUserIds
    },
    runner: {
      command: process.env.CODEX_COMMAND?.trim() || "codex",
      args: parseArgs(process.env.CODEX_ARGS || ""),
      cwd: runnerCwd,
      throttleMs: parseNumber(process.env.STREAM_THROTTLE_MS, 1200),
      maxBufferChars: parseNumber(process.env.STREAM_BUFFER_CHARS, 120000),
      telegramChunkSize: 3900
    },
    reasoning: {
      mode: process.env.REASONING_RENDER_MODE === "quote" ? "quote" : "spoiler"
    },
    shell: {
      enabled: shellEnabled,
      readOnly: parseBoolean(process.env.SHELL_READ_ONLY, true),
      allowedCommands: shellAllowedCommands,
      dangerousCommands: shellDangerousCommands,
      timeoutMs: parseNumber(process.env.SHELL_TIMEOUT_MS, 20000),
      maxOutputChars: parseNumber(process.env.SHELL_MAX_OUTPUT_CHARS, 12000)
    },
    cron: {
      dailySummary: process.env.CRON_DAILY_SUMMARY?.trim() || "0 9 * * *",
      timezone: process.env.CRON_TIMEZONE?.trim() || "Asia/Shanghai"
    },
    mcp: {
      servers: mcpServers
    },
    github: {
      token: process.env.GITHUB_TOKEN?.trim() || "",
      defaultWorkdir: githubDefaultWorkdir,
      defaultBranch: process.env.GITHUB_DEFAULT_BRANCH?.trim() || "main",
      e2eCommand:
        process.env.E2E_TEST_COMMAND?.trim() ||
        "npx playwright test --reporter=line"
    }
  };
}
