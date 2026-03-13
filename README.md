# codex-telegram-claws

`codex-telegram-claws` 是一个 Node.js (ESM) Telegram 超级代理。它在宿主机使用 `node-pty` 安全托管 `@openai/codex` CLI，并提供智能路由、MCP/Subagent 技能、推理流可视化、GitHub 自动化和定时主动任务。

对标参考项目：`RichardAtCT/claude-code-telegram`，但本项目专注 Codex CLI + MCP + Subagent 组合。

## 核心特性

- PTY 托管：强制 TTY 场景运行 CLI，避免无终端卡死。
- Agentic Routing：将消息分流到 Codex 链路或 Skill 链路（MCP/GitHub）。
- MCP Client：以 stdio 方式连接本机 MCP Server，供 Subagent/通用任务使用。
- MCP 去重策略：编码任务不再由 Bot 侧预注入 MCP 上下文，避免与 Codex 自身 MCP 重复调用。
- Reasoning Stream：解析 `<think>...</think>` 并用 Spoiler 或引用渲染。
- 丝滑输出：节流 `editMessageText`，长文自动切片，MarkdownV2 防崩。
- Zero Trust：白名单用户鉴权，非授权请求静默丢弃。
- GitHub Skill：自然语言驱动 commit/push、创建 repo、触发和查看测试。
- Cron 主动推送：每日发送“昨日代码变更摘要”。

## 架构总览

```text
Telegram Message
  -> bot/handlers.js
  -> orchestrator/router.js
     -> runner/ptyManager.js (编码任务 -> Codex CLI，使用 Codex 自身 MCP)
     -> orchestrator/skills/*.js (通用任务 -> MCP/GitHub Subagent)
  -> bot/formatter.js
  -> Telegram editMessageText/sendMessage
```

关键模块：

- `src/bot/`: 鉴权、中间件、格式化、Telegram 交互。
- `src/orchestrator/`: 路由决策、MCP 客户端、技能调度。
- `src/runner/`: PTY 生命周期、流式缓冲、节流刷新。
- `src/cron/`: 定时任务注册与主动消息推送。

## 目录结构

```text
codex-telegram-claws/
├── package.json
├── .env.example
├── src/
│   ├── index.js
│   ├── config.js
│   ├── bot/
│   │   ├── middleware.js
│   │   ├── formatter.js
│   │   └── handlers.js
│   ├── orchestrator/
│   │   ├── router.js
│   │   ├── mcpClient.js
│   │   └── skills/
│   │       ├── githubSkill.js
│   │       └── mcpSkill.js
│   ├── runner/
│   │   └── ptyManager.js
│   └── cron/
│       └── scheduler.js
└── README.md
```

## 前置条件

- Node.js: https://nodejs.org/en/download/current
- Codex CLI: https://github.com/openai/codex
- Telegram Bot Token: 通过 `@BotFather` 获取
- 可选：GitHub PAT（用于创建仓库与自动化操作）

## 快速开始

```bash
npm install
cp .env.example .env
# 至少配置 BOT_TOKEN, ALLOWED_USER_IDS, CODEX_WORKDIR
npm run start
```

开发与检查：

```bash
npm run dev
npm run check
```

## 环境变量说明

必填：

- `BOT_TOKEN`: Telegram Bot Token。
- `ALLOWED_USER_IDS`: 白名单用户 ID，逗号分隔。
- `CODEX_WORKDIR`: Codex CLI 工作目录（建议受限目录）。

常用可选：

- `CODEX_COMMAND`, `CODEX_ARGS`: Codex 启动命令与参数。
- `STREAM_THROTTLE_MS`: 1-1.5 秒最佳（建议 `1200`）。
- `REASONING_RENDER_MODE`: `spoiler` 或 `quote`。
- `CRON_DAILY_SUMMARY`, `CRON_TIMEZONE`: Cron 表达式与时区。
- `MCP_SERVERS`: JSON 数组，定义 MCP stdio server。
- `GITHUB_TOKEN`: GitHub API Token。
- `GITHUB_DEFAULT_WORKDIR`: Git 技能本地目录。
- `E2E_TEST_COMMAND`: 测试命令（默认 Playwright）。

MCP 示例：

```env
MCP_SERVERS=[{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/abs/path/workspace"]}]
```

## 路由与职责边界（避免冲突）

当前策略：

- 编码任务：直接路由到 Codex CLI，不做 Bot 侧 MCP 预取。
- 通用任务：路由到 MCP Skill（或 GitHub Skill）。
- 显式 MCP 指令：仅 `/mcp ...` 触发 Bot 侧 MCP 调用。

这样做的目的：

- 避免同一请求在 Bot MCP 与 Codex MCP 被重复查询。
- 降低时延、配额消耗和上下文不一致风险。
- 让“编码执行面”（Codex）与“控制面技能”（Subagent/Cron）解耦。

## Telegram 指令与技能

基础命令：

- `/help`: 查看帮助。
- `/interrupt`: 向 PTY 发送 `Ctrl+C`。
- `/stop`: 结束当前 chat 的 PTY 会话。
- `/cron_now`: 手动触发一次日报推送。

MCP Skill：

- `/mcp tools <server>`
- `/mcp call <server> <tool> {"query":"..."}`

GitHub Skill：

- `/gh commit "feat: xxx"` 自动 `git add .` + commit + push。
- `/gh push` 仅推送当前分支。
- `/gh create repo my-new-repo` 在当前账号创建仓库并关联 origin。
- `/gh run tests` 触发测试任务。
- `/gh test status <jobId>` 查询测试状态与输出尾部。

## 推理流可视化

当 Codex CLI 输出包含 `<think>...</think>` 时，`formatter.js` 会抽取并渲染：

- `spoiler` 模式：`||...||`（默认，点击展开）。
- `quote` 模式：引用块展示。

普通输出与推理输出会分段显示，避免污染代码可读性。

## 定时任务设计

默认 Cron：每天 09:00（`CRON_DAILY_SUMMARY`）统计昨日提交数据并主动推送给 `PROACTIVE_USER_IDS`。

摘要包含：

- 提交数量
- 改动文件数 / 插入 / 删除
- 最近提交列表（最多 8 条）

## Subagent / Cron 与 Codex 的关系

默认不会产生逻辑冲突，前提是遵守职责边界：

- Codex 负责“编码对话与执行”。
- Subagent（MCP/GitHub）负责“外部工具调用和控制动作”。
- Cron 负责“计划触发和状态通知”。

可能冲突点与建议：

- 并发写仓库：Cron 与 Codex 同时操作同一目录时，建议将 Cron 任务限制为只读汇总。
- 指令重入：对高风险指令（push/create repo）建议增加确认步骤或白名单命令。
- 上下文漂移：尽量让同一任务只由一个执行面处理，不要在同一请求里混用双 MCP。

## 安全基线

- 白名单鉴权必须开启，拒绝公开 Bot。
- 不提交 `.env`、Token、会话数据。
- 建议使用最小权限 PAT，限制 repo scope。
- 建议在生产使用独立系统用户运行并限制工作目录权限。

## 常见问题排查

- Bot 不响应：检查 `BOT_TOKEN` 与 `ALLOWED_USER_IDS` 是否正确。
- Codex 无输出：检查 `CODEX_COMMAND` 是否可执行，`CODEX_WORKDIR` 是否存在。
- Markdown 报错：确认输出是否超长，已内置切片与转义，但极端字符流仍建议缩短上下文。
- GitHub 创建仓库失败：检查 `GITHUB_TOKEN` scope 与账号配额。
- MCP 调用失败：先 `/mcp tools <server>` 验证服务连通与工具列表。
- 觉得 MCP 重复调用：确认编码请求是否直接走 Codex；Bot 侧 MCP 仅在 `/mcp` 或通用任务触发。
