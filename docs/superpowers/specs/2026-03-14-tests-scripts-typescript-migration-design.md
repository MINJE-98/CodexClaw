# Tests And Scripts TypeScript Migration Design

**Date:** 2026-03-14

**Goal:** Finish the next TypeScript migration pass by converting the repository's remaining executable test and script JavaScript files to `.ts`, while preserving the current `tsx`-driven workflow and leaving configuration files in `JS/CJS`.

## Context

The runtime migration for `src/` is complete:

- Runtime modules under `src/` now resolve through TypeScript.
- `tsconfig.json` already includes `tests/**/*` and `scripts/**/*`.
- Repository commands still point at JavaScript entry files for tooling outside `src/`.

The remaining JavaScript surface is now concentrated in three areas:

- `tests/*.js`
- `scripts/healthcheck.js`
- `scripts/telegramSmoke.js`

Configuration files such as `eslint.config.js` and `ecosystem.config.cjs` are still JavaScript, but they are operationally different from application tests and script entrypoints and do not need to be pulled into this pass.

## Scope

This design covers:

- converting every `tests/*.js` file to `tests/*.ts`
- converting `scripts/healthcheck.js` to `scripts/healthcheck.ts`
- converting `scripts/telegramSmoke.js` to `scripts/telegramSmoke.ts`
- updating `package.json` script entries that still reference the JavaScript script files
- making any minimal type-boundary adjustments required so migrated tests and scripts compile cleanly under the existing NodeNext TypeScript configuration

## Non-Goals

- Converting `eslint.config.js`
- Converting `ecosystem.config.cjs`
- Changing test organization, assertion style, or runner selection
- Refactoring runtime code only to satisfy aesthetic type cleanup
- Changing Telegram smoke-check semantics or healthcheck output format

## Constraints

- Preserve the current developer workflow based on `tsx`
- Preserve NodeNext `.js` import specifiers inside TypeScript files
- Avoid broad test refactors; the migration should remain mechanical unless type safety requires a small fixture boundary
- Keep user-facing script behavior unchanged, especially exit codes and console output

## Recommended Approach

Use a scripts-first, tests-second migration:

1. Move the two script entrypoints to `.ts` and update `package.json`.
2. Migrate the test files in place, preserving one-file-per-area coverage.
3. Resolve any remaining type friction at mock, fixture, and helper boundaries instead of widening production types just to satisfy tests.

This order validates the executable edges early and keeps the larger bulk rename of the tests focused and low-risk.

## File Groups

### 1. Script Entrypoints

Convert:

- `scripts/healthcheck.js`
- `scripts/telegramSmoke.js`

Update:

- `package.json`

Purpose:

- Keep repository commands targeting TypeScript entrypoints directly.
- Add explicit typing around process flags and Telegram API payloads where the scripts currently rely on implicit shapes.

Expected typing:

- parsed CLI booleans for `healthcheck`
- minimal response types for Telegram `getMe` and `sendMessage`
- normalized config-load error handling using `Error | unknown`

### 2. Test Suite Migration

Convert:

- all top-level `tests/*.js` files

Purpose:

- Remove the remaining JavaScript test surface without changing the test runner.
- Ensure TypeScript can check the same test behavior already exercised through `node --import tsx --test`.

Expected typing:

- test-local mocks and fixtures with narrow structural types
- explicit `unknown` handling where tests assert thrown errors
- minimal helper annotations for stubbed methods and fake session state

### 3. Typecheck And Workflow Alignment

Verify:

- `tsconfig.json` still covers the migrated files without extra config splitting
- ESLint and Prettier still run cleanly on the renamed files
- package scripts resolve the new TypeScript entrypoints

Purpose:

- Keep the migration bounded to file conversion rather than introducing a second config layer.

## Type Boundary Decisions

The migration should keep types local to the boundary that actually needs them.

Examples:

- `scripts/telegramSmoke.ts` should define tiny payload interfaces for the exact Telegram fields it reads, instead of importing or inventing a large bot schema.
- Test files should type fake collaborators structurally at the point of use, instead of forcing production modules to export broader test-only interfaces.
- Script entrypoints should continue importing runtime modules via `.js` specifiers so they match the repository's NodeNext pattern.

This keeps the migration pragmatic and avoids turning a mechanical rename into a repo-wide type redesign.

## Testing Strategy

Verification should happen in two layers.

### Focused verification

After migrating scripts:

- run `npm run typecheck`
- run `BOT_TOKEN=dummy-token ALLOWED_USER_IDS=1 npm run healthcheck`

After migrating tests:

- run `npm test`
- rerun `npm run typecheck`

### Final verification

Run the repository-required gate on the completed pass:

- `npm run check`
- `npm run lint`
- `npm run format:check`
- `npm test`
- `BOT_TOKEN=dummy-token ALLOWED_USER_IDS=1 npm run healthcheck`

`npm run healthcheck:live` and `npm run telegram:smoke` should not be treated as mandatory verification for this migration unless real credentials are intentionally available, because this pass is not changing their live semantics.

## Risks

- Some tests may currently rely on JavaScript's implicit `any` behavior around mocks or thrown values, and those edges may need small local annotations.
- `telegramSmoke` performs raw `fetch` calls and inspects untyped JSON payloads; over-modeling these responses would add noise with little value.
- Renaming many test files at once can create review churn, so the implementation plan should batch the work into coherent slices rather than one large rename commit.

## Success Criteria

- No top-level `tests/*.js` files remain.
- `scripts/healthcheck.ts` and `scripts/telegramSmoke.ts` replace the JavaScript entry files.
- `package.json` script commands resolve the new `.ts` entrypoints.
- Repository verification commands still pass with unchanged behavior.
- Remaining JavaScript is limited to intentionally retained configuration files.

## Follow-Up

After this design is accepted, the implementation plan should break the work into small TDD-oriented tasks:

1. script entrypoint migration
2. test-file migration in small batches
3. final verification and residual JavaScript audit
