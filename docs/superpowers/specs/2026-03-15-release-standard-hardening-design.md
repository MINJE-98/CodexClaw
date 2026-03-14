# Release Standard Hardening Design

**Date:** 2026-03-15

**Goal:** Finish the repository's TypeScript transition at the maintenance boundary, add a same-workspace contention guard for Telegram-driven Codex runs, and align CI, release workflows, and operations docs with an engineering-grade release path.

## Context

The repository has already completed the high-value TypeScript migration work:

- `src/`, `tests/`, and `scripts/` now resolve through TypeScript.
- Runtime error normalization has been centralized in `src/lib/errors.ts`.
- ESLint and PM2 configuration already have TypeScript source-of-truth files:
  - `eslint.config.ts`
  - `ecosystem.config.ts`

What remains is not a large codebase rewrite. The remaining gaps are concentrated in three areas:

1. **Tool compatibility edges**
   - `eslint.config.js`
   - `ecosystem.config.cjs`
2. **Concurrent workspace safety**
   - the bot can currently start multiple Codex runs against the same workdir from different chats without a strong warning gate
3. **Release-standard alignment**
   - release workflows and docs still contain outdated JavaScript references or weaker-than-desired gates

That means the repository is already close to "all-TypeScript," but it still needs a clean policy for compatibility shims and a stronger operational story before it can be treated as release-ready.

## Scope

This design covers:

- keeping TypeScript as the only maintained source of truth for local config entrypoints
- retaining the current `JS/CJS` shims only as compatibility loaders when the surrounding tooling still expects them
- adding same-workspace contention detection for Codex tasks started through Telegram
- requiring an explicit continue action before starting a second Codex task in the same workdir from another chat
- updating bot copy and command handling to expose that guardrail
- aligning CI, release, and smoke workflows with a stronger engineering release path
- updating README and operations/release docs to reflect the current TypeScript-first runtime and the new workspace-contention behavior

## Non-Goals

This pass does not cover:

- removing `eslint.config.js` or `ecosystem.config.cjs` if the ecosystem still needs them as loaders
- detecting Codex sessions started outside this bot process, such as a separate terminal session on the same machine
- redesigning router arbitration or MCP/subagent contracts
- changing the shell approval model beyond documenting how it relates to workspace contention
- introducing a packaged build output directory or compile-to-`dist` deployment model

## Constraints

- Preserve the current `tsx`-based runtime and local developer workflow
- Keep NodeNext `.js` import specifiers inside TypeScript files
- Avoid broad refactors outside the contention guard and release-alignment work
- Keep the compatibility shims extremely thin and free of duplicated configuration logic
- The same-workspace guard must not silently block forever; the user must be able to explicitly continue once

## Recommended Approach

Use a TypeScript-first, compatibility-shim-second strategy with a runtime contention guard:

1. Treat `eslint.config.ts` and `ecosystem.config.ts` as the only maintained config sources.
2. Keep `eslint.config.js` and `ecosystem.config.cjs` as minimal loaders that forward to the TypeScript source.
3. Add workdir-level contention detection inside `PtyManager`, because it already owns chat session state and workdir selection.
4. When another chat already has an active Codex run in the same workdir, reject the new request with a strong warning and store it as a pending one-shot retry.
5. Add `/continue` so the user can replay exactly that blocked request once, without turning the guardrail into a permanent bypass.
6. Tighten release workflow expectations and clean up outdated docs and command references.

This keeps the implementation local to existing ownership boundaries:

- `PtyManager` decides whether a Codex run may start
- Telegram handlers surface the result to the user
- docs and workflows reflect the stronger policy

## File Groups

### 1. Config Source-Of-Truth And Compatibility Layer

Primary files:

- `eslint.config.ts`
- `eslint.config.js`
- `ecosystem.config.ts`
- `ecosystem.config.cjs`
- `tests/config-files.test.ts`

Purpose:

- preserve TypeScript as the single maintained config source
- ensure the compatibility shims remain correct and point at the TypeScript runtime entry
- keep tooling behavior stable without duplicating configuration logic

Expected outcome:

- no config logic lives only in `JS/CJS`
- docs describe the TypeScript source files as canonical
- PM2 still starts from the compatibility entrypoint, which delegates to TypeScript

### 2. Workspace Contention Guard

Primary files:

- `src/runner/ptyManager.ts`
- `src/bot/handlers.ts`
- `src/bot/i18n.ts`
- `tests/ptyManager.test.ts`
- `tests/handlers.test.ts`

Purpose:

- detect when another chat is already running Codex in the same workdir
- block the new request by default
- store the blocked request as a pending one-shot action
- expose `/continue` so the user can explicitly override the guard once

Design decisions:

- detection is scoped to this bot process only
- conflicts are keyed by resolved workdir, not by repo name text
- the explicit continue action replays only the latest blocked request for that chat
- switching projects or successfully replaying the task clears the pending blocked request

### 3. Release-Standard Workflow And Documentation Alignment

Primary files:

- `package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/workflows/telegram-smoke.yml`
- `README.md`
- `docs/operations.md`
- `docs/release.md`

Purpose:

- remove outdated references to JavaScript runtime/config entrypoints
- document the TypeScript-first runtime and the compatibility shim policy
- strengthen release workflow gates with `healthcheck:strict`
- add workflow concurrency rules so CI, release, and smoke jobs do not overlap unnecessarily
- document same-workspace contention behavior and the recommended worktree-based mitigation for external parallel work

## Data And Behavior Changes

### Pending blocked prompt state

`PtyManager` should store a small pending prompt payload per chat when a request is blocked by workspace contention. It should include only what is needed to replay the task:

- prompt text
- send options relevant to replay
- resolved workdir
- blocking chat id

This should stay runtime-only and flow through the existing runtime-state model only if persistence is clearly needed. For this pass, persistence is not required; a blocked request can be in-memory only.

### Send result contract

`sendPrompt()` currently distinguishes only successful starts and local "busy" conditions. It should be extended so handlers can tell the difference between:

- the same chat already being busy
- another chat occupying the same workdir

That lets Telegram return a different message:

- normal busy -> wait or interrupt
- workspace conflict -> strong warning + `/continue`

### Handler behavior

`/exec`, `/auto`, `/plan`, and plain-text Codex routing should all respect the same workspace-contention guard because they all can drive real file changes or repository state changes.

`/continue` should:

- replay the stored blocked request exactly once
- fail gracefully if no blocked request exists
- not create a permanent bypass flag

## Testing Strategy

This pass should stay TDD-driven for the behavior changes.

### Focused red-green coverage

Add failing tests first for:

- `PtyManager` rejecting a prompt when another chat is active in the same workdir
- `PtyManager` replaying a blocked request through the explicit continue path
- Telegram handlers returning the contention warning and invoking `/continue`

### Focused verification

Run focused suites during implementation:

- `node --import tsx --test tests/ptyManager.test.ts`
- `node --import tsx --test tests/handlers.test.ts`
- `node --import tsx --test tests/config-files.test.ts`

### Final verification

Run the repository release gate on the completed pass:

- `npm run check`
- `npm run lint`
- `npm run format:check`
- `npm test`
- `BOT_TOKEN=dummy-token ALLOWED_USER_IDS=1 npm run healthcheck`

Optional live verification remains credential-gated:

- `npm run healthcheck:live`
- `npm run telegram:smoke`

## Risks

- A workspace guard that is too broad could block safe parallel use in different workdirs; detection must stay keyed to resolved workdir only.
- A continue override that is too sticky would undermine the guardrail; it must stay one-shot.
- Telegram handler tests do not currently exist, so introducing them should stay narrowly focused on registration and command behavior rather than full bot integration.
- Tooling compatibility is the reason the `JS/CJS` shims remain; trying to remove them prematurely would add risk without meaningful release value.

## Success Criteria

- `eslint.config.ts` and `ecosystem.config.ts` remain the only maintained config sources.
- The compatibility shims stay thin and continue to resolve the TypeScript sources correctly.
- A second Codex task in the same workdir from another chat is blocked by default.
- `/continue` explicitly replays the blocked request once.
- CI and release workflows reflect the stronger release gate and concurrency policy.
- README and operations/release docs no longer describe the repository as a mixed JavaScript runtime or point at outdated script paths.
