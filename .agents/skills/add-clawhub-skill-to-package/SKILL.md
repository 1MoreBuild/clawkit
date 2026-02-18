---
name: add-clawhub-skill-to-package
description: Add a package-local OpenClaw runtime skill folder (skill-openclaw) and ClawHub publish workflow to an existing clawkit package.
---

# add-clawhub-skill-to-package

Use this skill when a CLI package already exists and needs OpenClaw runtime skill integration.

## Scope

- Target only existing package paths: `packages/<tool>-cli`.
- Add runtime skill under package-local `skill-openclaw`.
- Keep `.agents/skills` and runtime skill concept strictly separated.

## Required inputs

- `package_path` (for example `packages/byr-cli`)
- `skill_name`
- `skill_slug`
- `required_bins` (usually CLI executable name)

## Files to add

```text
packages/<tool>-cli/skill-openclaw/
  SKILL.md
  examples.md (optional)
  publish.json (recommended)
```

## SKILL.md requirements

- YAML frontmatter with `name`, `description`, and single-line JSON `metadata`.
- `metadata.openclaw.requires.bins` must include the package binary.
- Define usage boundaries and side-effect confirmation policy.
- Command examples should use `--json`.

## Package script requirements

Add scripts in package `package.json`:

- `skill:publish` => `clawhub publish ./skill-openclaw ...`
- `skill:sync` (optional) => `clawhub sync --root ./skill-openclaw --all`

## Publish workflow requirements

Document:

1. install `clawhub` CLI
2. `clawhub login`
3. run package `skill:publish`
4. optional `skill:sync`

Keep web upload as fallback only.

## Validation checklist

- `pnpm --filter <pkg> test`
- `pnpm --filter <pkg> check`
- verify `skill-openclaw/SKILL.md` references correct binary in `requires.bins`
