# Skill Publish Workflow

This repository publishes runtime skills from package-local folders:

- `packages/<tool>-cli/skill-openclaw`

## Recommended Flow (CLI)

1. Install ClawHub CLI.

```bash
npm i -g clawhub
```

2. Login once.

```bash
clawhub login
clawhub whoami
```

3. Publish from package script.

```bash
pnpm --filter byr-pt-cli skill:publish
```

4. Optional bulk sync.

```bash
pnpm --filter byr-pt-cli skill:sync
```

## Fallback Flow (Web)

If CLI is unavailable, upload the same `skill-openclaw` folder through the ClawHub website workflow.

## Notes

- Keep `publish.json` in each skill folder updated before release.
- Run package tests before publishing a new skill version.
