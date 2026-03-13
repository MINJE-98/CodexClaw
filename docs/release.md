# Release Process

## Release Type

- Use `v0.x` tags for beta releases.
- Do not cut `v1.0.0` until CI, supervisor deployment, and Telegram smoke checks are part of the normal release path.

## Pre-Release Checklist

Run locally:

```bash
npm install
npm run ci
```

Recommended production checks:

```bash
npm run healthcheck:strict
node scripts/healthcheck.js --strict --telegram-live
```

Manual checks:

- verify `/status`, `/repo`, `/language`, `/verbose`, `/mcp list`, and `/gh` on a real Telegram chat
- verify PTY mode is active on the target host
- verify cron and proactive push configuration
- verify only one bot instance is polling

## Tag And Publish

```bash
git checkout main
git pull --ff-only
npm run ci
git tag v0.2.0
git push origin main --tags
```

Pushing a `v*` tag triggers the GitHub release workflow.

## Rollback

```bash
git checkout <previous-stable-tag>
npm install
pm2 restart codex-telegram-claws
```

After rollback, rerun:

```bash
npm run healthcheck
```
