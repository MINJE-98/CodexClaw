# Frontend Dev Layer Design

## Goal

Add a minimal frontend debugging layer to the Telegram bot so users can manage a repo-local frontend dev server from chat without turning `/sh` into a general process runner. At the same time, reshape the top-level documentation into a more agent-friendly, skill-like onboarding flow and provide a dedicated `SKILL.md`.

## Scope

In scope:

- add `/dev start`
- add `/dev stop`
- add `/dev status`
- add `/dev logs`
- add `/dev url`
- detect `npm`/`pnpm`/`yarn`/`bun` script runners from repository metadata
- prefer `dev` scripts and fall back to `start`
- keep dev server state shared per repo workdir, not per chat
- update `README.md` into a skill-like structure
- add a root `SKILL.md` that agents can consume directly

Out of scope:

- arbitrary shell execution through `/dev`
- build/test/preview orchestration
- persistent dev server state across bot restarts
- cross-machine or public tunnel exposure

## Design

### Repo-Scoped Dev Server Manager

Create a dedicated manager under `src/runner/` that owns frontend dev server processes. It will:

- key running processes by resolved repo workdir
- inspect `package.json`
- choose a startup script:
  - `dev` first
  - `start` second
- choose the package manager from lockfiles
- spawn the selected script
- keep a bounded stdout/stderr tail
- detect the first `http://` or `https://` URL from logs
- expose status and stop operations

The manager is intentionally separate from `ShellManager`. `/dev` is a narrow, purpose-built control surface for frontend repos, not a generic command channel.

### Repo-Level Sharing

Dev server state is repo-scoped and shared across chats. This differs from Codex live sessions on purpose:

- live coding context remains `chat + repo`
- dev server process ownership is `repo`

That means multiple chats can inspect the same repo server with `/dev status`, but the bot will not spawn duplicate servers for the same repo.

### Bot Command Surface

Add a new `/dev` command family:

- `/dev start`
- `/dev stop`
- `/dev status`
- `/dev logs`
- `/dev url`

The handler will always operate on the current repo workdir from `/repo`.

### Documentation Shape

`README.md` should read like an operator skill:

- what this project does
- install
- required env
- Telegram quick start
- repo switching and runtime model
- frontend debugging commands
- safety limits
- verification

Add a root `SKILL.md` with concise instructions for agent users:

- install
- env setup
- start bot
- common Telegram commands
- `/dev` workflow

## Testing

Add coverage for:

- selecting `dev` before `start`
- falling back from `dev` to `start`
- repo-scoped running state
- log tail and URL detection
- `/dev` handler responses
- docs mention the new `/dev` command family and skill entrypoint
