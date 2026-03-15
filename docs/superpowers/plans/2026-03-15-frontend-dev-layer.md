# Frontend Dev Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal `/dev` command family for repo-scoped frontend server control and publish agent-friendly skill-style documentation.

**Architecture:** Introduce a dedicated `DevServerManager` for repo-level process orchestration instead of extending `/sh`. Wire the manager into Telegram handlers, then update `README.md` and add a root `SKILL.md` so both humans and agents have a direct installation and usage path.

**Tech Stack:** Node.js child processes, Telegraf command handlers, TypeScript, Node test runner

---

## Chunk 1: Dev Server Manager

### Task 1: Add failing manager tests

**Files:**

- Create: `tests/devServerManager.test.ts`
- Reference: `src/runner/shellManager.ts`

- [ ] **Step 1: Write a failing test for preferring `dev` over `start`**
- [ ] **Step 2: Run `node --import tsx --test tests/devServerManager.test.ts` and confirm it fails**
- [ ] **Step 3: Write a failing test for falling back to `start` when `dev` is missing**
- [ ] **Step 4: Run the same focused test command and confirm the new failure**
- [ ] **Step 5: Write a failing test for capturing logs and a detected local URL**
- [ ] **Step 6: Run the same focused test command and confirm the failure**

### Task 2: Implement the manager

**Files:**

- Create: `src/runner/devServerManager.ts`
- Test: `tests/devServerManager.test.ts`

- [ ] **Step 1: Add the minimal manager types for repo-scoped status, start, stop, logs, and URL**
- [ ] **Step 2: Parse `package.json` and choose `dev` or `start`**
- [ ] **Step 3: Detect package manager from lockfiles**
- [ ] **Step 4: Spawn the selected script and keep a bounded output tail**
- [ ] **Step 5: Detect the first local URL from process output**
- [ ] **Step 6: Re-run `node --import tsx --test tests/devServerManager.test.ts` and confirm green**

## Chunk 2: Telegram `/dev` Commands

### Task 3: Add failing handler tests

**Files:**

- Modify: `tests/handlers.test.ts`
- Reference: `src/bot/handlers.ts`

- [ ] **Step 1: Write a failing test for `/dev start`**
- [ ] **Step 2: Run `node --import tsx --test tests/handlers.test.ts` and confirm it fails**
- [ ] **Step 3: Write a failing test for `/dev status` / `/dev url` / `/dev logs`**
- [ ] **Step 4: Re-run the same focused test command and confirm failure**

### Task 4: Implement `/dev`

**Files:**

- Modify: `src/bot/handlers.ts`
- Modify: `src/bot/i18n.ts`
- Modify: `src/index.ts`
- Create or Modify: `src/runner/devServerManager.ts`
- Test: `tests/handlers.test.ts`

- [ ] **Step 1: Inject `DevServerManager` into `registerHandlers`**
- [ ] **Step 2: Add `/dev` command parsing for `start|stop|status|logs|url`**
- [ ] **Step 3: Add localized text for `/dev` responses and help text**
- [ ] **Step 4: Re-run `node --import tsx --test tests/handlers.test.ts tests/devServerManager.test.ts` and confirm green**

## Chunk 3: Documentation

### Task 5: Skill-style documentation

**Files:**

- Modify: `README.md`
- Create: `SKILL.md`

- [ ] **Step 1: Restructure `README.md` into a skill-like quick-start flow**
- [ ] **Step 2: Document `/dev start|stop|status|logs|url`**
- [ ] **Step 3: Add a concise root `SKILL.md` for agent installation and usage**
- [ ] **Step 4: Verify command names and examples match the implementation**

## Chunk 4: Verification

### Task 6: Full verification and runtime restart

**Files:**

- Review only: `git diff --stat`
- Review only: `git status --short`

- [ ] **Step 1: Run `npm run check`**
- [ ] **Step 2: Run `npm run lint`**
- [ ] **Step 3: Run `npm run format:check`**
- [ ] **Step 4: Run `npm test`**
- [ ] **Step 5: Run `BOT_TOKEN=dummy-token ALLOWED_USER_IDS=1 npm run healthcheck`**
- [ ] **Step 6: Restart the bot process on the updated code**
