---
name: release-byr-cli
description: Release a new `byr-pt-cli` patch/minor version with changelog update and tag-driven npm + Homebrew publish.
---

# release-byr-cli

Use this skill when asked to publish a new `byr-pt-cli` version.

## Required inputs

- `target_version` (for example `0.1.6`)
- `release_notes` (short bullet list for `CHANGELOG.md`)

## Canonical files

- `packages/byr-cli/package.json`
- `CHANGELOG.md`
- `.github/workflows/release.yml`
- `AGENTS.md`

## Release steps

1. Update `packages/byr-cli/package.json` `version` to `target_version`.
2. Add a new `## [target_version] - YYYY-MM-DD` section in `CHANGELOG.md`.
3. Run quality gate:
   - `pnpm check`
   - `pnpm --filter byr-pt-cli build`
4. Commit changes.
5. Push `main`.
6. Create and push tag:
   - `git tag v<target_version>`
   - `git push origin v<target_version>`
7. Confirm release workflow success (`.github/workflows/release.yml`).
8. Verify published outputs:
   - `npm view byr-pt-cli version`
   - `brew info 1MoreBuild/tap/byr-pt-cli`

## Guardrails

- Tag must match package version exactly.
- Do not run manual `npm publish` or manual tap edits unless workflow recovery is required.
- If workflow fails after npm publish, re-run workflow with the same tag.
