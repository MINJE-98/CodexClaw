# Release Standard Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the repository to an engineering release standard by keeping TypeScript as the only maintained config source, adding same-workspace contention protection for Telegram-driven Codex runs, and aligning workflows and docs with the TypeScript-first runtime.

**Architecture:** Keep the current TypeScript config files as canonical and preserve the `JS/CJS` files only as thin compatibility shims. Add workdir-level contention detection inside `PtyManager`, surface it through Telegram handlers with a one-shot `/continue` override, then tighten CI/release workflows and documentation around the current runtime model.

**Tech Stack:** Node.js 20+, TypeScript 5.x, tsx, node:test, Telegraf-style handlers, GitHub Actions, PM2 compatibility shim

---

## File Map

### Workspace Contention Guard

- Modify: `src/runner/ptyManager.ts`
- Modify: `src/bot/handlers.ts`
- Modify: `src/bot/i18n.ts`
- Modify: `tests/ptyManager.test.ts`
- Create: `tests/handlers.test.ts`

### Config And Release Alignment

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/telegram-smoke.yml`
- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `docs/release.md`
- Verify: `tests/config-files.test.ts`

### Planning Artifacts

- Create: `docs/superpowers/specs/2026-03-15-release-standard-hardening-design.md`
- Create: `docs/superpowers/plans/2026-03-15-release-standard-hardening.md`

## Chunk 1: Workspace Contention Guard

### Task 1: Write Failing `PtyManager` Tests For Workspace Conflicts

**Files:**

- Modify: `tests/ptyManager.test.ts`
- Test: `tests/ptyManager.test.ts`

- [ ] **Step 1: Add a regression test that blocks a prompt when another chat is active in the same workdir**

Extend `tests/ptyManager.test.ts` with a case that:

- creates a manager
- installs a fake active session for chat `2` in the current workdir
- calls `sendPrompt()` for chat `1`
- expects a `workspace_busy` result instead of starting a new run

Use the existing local helper pattern rather than real Codex execution.

- [ ] **Step 2: Add a regression test for the one-shot continue path**

In the same file, add a case that:

- blocks a request because another chat is active in the same workdir
- removes the blocking session
- calls the explicit continue path
- verifies the pending request is replayed once
- verifies a second continue call reports that nothing is pending

- [ ] **Step 3: Run the focused `PtyManager` suite and confirm RED**

Run:

```bash
node --import tsx --test tests/ptyManager.test.ts
```

Expected: FAIL because the current `PtyManager` does not expose workspace-conflict results or a continue path yet.

- [ ] **Step 4: Commit nothing yet**

Do not implement production code before the test is observed failing for the expected reason.

### Task 2: Implement Minimal `PtyManager` Support For Conflict Detection And Replay

**Files:**

- Modify: `src/runner/ptyManager.ts`
- Test: `tests/ptyManager.test.ts`

- [ ] **Step 1: Add internal pending-request state to chat runtime state**

Keep this state in-memory only. Model only what replay needs:

```ts
interface PendingPromptRequest {
  prompt: string;
  workdir: string;
  options: SendPromptOptions;
  blockingChatId: string;
}
```

Do not persist it to runtime state storage in this pass.

- [ ] **Step 2: Extend `sendPrompt()` with a distinct workspace-conflict result**

Add a result branch that includes:

- `reason: "workspace_busy"`
- the blocking chat id
- the conflicting workdir or relative workdir
- the blocking mode

The conflict check must:

- ignore the current chat
- compare resolved workdirs only
- apply to `/exec`, `/auto`, `/plan`, and normal Codex routing because they all flow through `sendPrompt()`

- [ ] **Step 3: Add a one-shot continue method on `PtyManager`**

Implement a method that:

- replays the pending request for a chat once
- bypasses the workspace-conflict check for that replay only
- clears the pending request after a successful replay
- returns a typed result when nothing is pending

- [ ] **Step 4: Clear stale pending requests when the workdir changes**

When `switchWorkdir()` succeeds, clear the pending blocked request for that chat so `/continue` cannot replay a stale task into a different project context.

- [ ] **Step 5: Re-run the focused `PtyManager` suite and confirm GREEN**

Run:

```bash
node --import tsx --test tests/ptyManager.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the `PtyManager` slice**

```bash
git add src/runner/ptyManager.ts tests/ptyManager.test.ts
git commit -m "feat: guard against same-workspace codex contention"
```

### Task 3: Write Failing Handler Tests For The Warning Message And `/continue`

**Files:**

- Create: `tests/handlers.test.ts`
- Test: `tests/handlers.test.ts`

- [ ] **Step 1: Add a narrow registration test for plain-text contention handling**

Create a fake bot object that records:

- `command(name, handler)`
- `on(event, handler)`

Use it to register handlers, then trigger the plain-text handler with a fake context. Stub `ptyManager.sendPrompt()` to return:

```ts
{
  started: false,
  reason: "workspace_busy",
  activeMode: "sdk",
  blockingChatId: "2",
  relativeWorkdir: "."
}
```

Assert that the bot replies with a strong warning that includes `/continue`.

- [ ] **Step 2: Add a narrow `/continue` command test**

Stub `ptyManager.continuePendingPrompt()` so the handler sees:

- one test where replay starts successfully
- one test where no pending request exists

Assert that the reply text matches the intended behavior in both cases.

- [ ] **Step 3: Run the focused handler suite and confirm RED**

Run:

```bash
node --import tsx --test tests/handlers.test.ts
```

Expected: FAIL because `/continue` and the new warning copy do not exist yet.

### Task 4: Implement Handler And Copy Support For `/continue`

**Files:**

- Modify: `src/bot/handlers.ts`
- Modify: `src/bot/i18n.ts`
- Test: `tests/handlers.test.ts`

- [ ] **Step 1: Add the new translated copy**

Add only the keys required for this behavior in all supported locales:

- help text line for `/continue`
- workspace contention warning
- continue success message
- continue-no-pending message

Keep the warning explicit that another chat is active in the same project/workdir and that `/continue` overrides once.

- [ ] **Step 2: Refactor prompt-result handling just enough to avoid duplication**

Add a local helper in `registerHandlers()` that distinguishes:

- `busy`
- `workspace_busy`
- started successfully

Reuse it across `/exec`, `/auto`, `/plan`, and plain-text Codex routing.

- [ ] **Step 3: Add the `/continue` command**

The handler should:

- call `ptyManager.continuePendingPrompt(ctx)`
- send the success message if replay starts
- send the no-pending message if nothing is blocked
- still respect normal busy handling if the current chat already has a running task

- [ ] **Step 4: Re-run the focused handler suite and confirm GREEN**

Run:

```bash
node --import tsx --test tests/handlers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run both behavior suites together**

Run:

```bash
node --import tsx --test tests/ptyManager.test.ts tests/handlers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the handler slice**

```bash
git add src/bot/handlers.ts src/bot/i18n.ts tests/handlers.test.ts
git commit -m "feat: add continue flow for blocked workspace prompts"
```

## Chunk 2: Config And Release Alignment

### Task 5: Keep TypeScript As The Config Source Of Truth

**Files:**

- Modify: `README.md`
- Modify: `docs/operations.md`
- Modify: `docs/release.md`
- Test: `tests/config-files.test.ts`

- [ ] **Step 1: Audit and correct outdated JavaScript path references**

Update documentation that still refers to:

- `src/orchestrator/skills/*.js`
- `src/bot/formatter.js`
- `src/cron/scheduler.js`
- `node scripts/healthcheck.js ...`

Keep NodeNext `.js` import specifiers in code untouched; this step is documentation-only.

- [ ] **Step 2: Describe the compatibility shim policy**

Document that:

- `eslint.config.ts` and `ecosystem.config.ts` are canonical
- `eslint.config.js` and `ecosystem.config.cjs` are compatibility entrypoints
- PM2 should still be started through `ecosystem.config.cjs`

- [ ] **Step 3: Re-run config-shim regression coverage**

Run:

```bash
node --import tsx --test tests/config-files.test.ts
```

Expected: PASS.

### Task 6: Tighten Package Scripts And GitHub Workflows For Release Use

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/telegram-smoke.yml`

- [ ] **Step 1: Add a release verification script**

Add:

```json
{
  "release:check": "npm run ci && npm run healthcheck:strict"
}
```

- [ ] **Step 2: Add workflow concurrency guards**

Use GitHub Actions `concurrency` in each workflow so repeat runs on the same ref do not pile up unnecessarily.

Recommended shape:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

For tagged releases, use `cancel-in-progress: false`.

- [ ] **Step 3: Strengthen the release workflow gate**

Update `.github/workflows/release.yml` so the release job runs the new release verification script before publishing the GitHub release.

- [ ] **Step 4: Keep CI and smoke behavior aligned with the current TypeScript-first runtime**

Do not add live-secret requirements to normal CI. Keep the smoke workflow manually dispatchable and secret-gated.

- [ ] **Step 5: Commit the release-alignment slice**

```bash
git add package.json .github/workflows/ci.yml .github/workflows/release.yml .github/workflows/telegram-smoke.yml README.md docs/operations.md docs/release.md
git commit -m "chore: align release workflow with typescript runtime"
```

## Chunk 3: Final Verification

### Task 7: Run The Full Repository Verification Gate

**Files:**

- Verify only

- [ ] **Step 1: Run the complete required verification**

Run:

```bash
npm run check
npm run lint
npm run format:check
npm test
BOT_TOKEN=dummy-token ALLOWED_USER_IDS=1 npm run healthcheck
```

Expected:

- all commands exit `0`
- the full test suite passes
- formatting and linting are clean

- [ ] **Step 2: Inspect the final working tree**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended files are changed and no accidental artifacts are present.

- [ ] **Step 3: Commit any remaining verification-driven fixes**

If verification required follow-up changes, commit them before finishing.

## Chunk 4: Branch Completion

### Task 8: Finish The Development Branch

**Files:**

- Verify only

- [ ] **Step 1: Review the completed plan against the diff**

Confirm:

- workspace contention is blocked by default
- `/continue` replays once
- docs and workflows align with the TypeScript-first runtime
- compatibility shims remain thin

- [ ] **Step 2: Use `finishing-a-development-branch`**

Present the standard integration options only after fresh verification has passed.
