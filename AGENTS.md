# AGENTS.md

## Release Source Of Truth

Use `.github/workflows/release.yml` as the canonical release pipeline for `byr-pt-cli`.

## Release Skill

Reusable release instructions are also available in:

- `/Users/bytedance/Projects/clawkit/.agents/skills/release-byr-cli/SKILL.md`

## How To Release

1. Ensure `/Users/bytedance/Projects/clawkit/packages/byr-cli/package.json` version is the target version.
2. Update `/Users/bytedance/Projects/clawkit/CHANGELOG.md` with a new version section (date + notable changes).
3. Create and push a matching tag:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
4. Do not run manual `npm publish` or manual Homebrew formula edits unless the workflow fails.

## Required Secrets (GitHub Actions)

- `HOMEBREW_TAP_TOKEN`: token that can push to `1MoreBuild/homebrew-tap`

npm publish uses OIDC trusted publishing (no `NPM_TOKEN` secret required).

## Workflow Behavior

The release workflow does:

1. `pnpm check` + package build.
2. Publish `byr-pt-cli` to npm (skip if already published).
3. Wait for npm propagation.
4. Resolve tarball URL + SHA256.
5. Update and push `Formula/byr-pt-cli.rb` in `1MoreBuild/homebrew-tap`.

## CI and Security Baseline

- Main CI workflow: `.github/workflows/ci.yml`
- Install smoke workflow: `.github/workflows/install-smoke.yml`
- Secrets baseline refresh: `./scripts/refresh-secrets-baseline.sh`
- If CI reports baseline mismatch, refresh baseline in the same PR.

## Manual Recovery

If release fails, follow `/Users/bytedance/Projects/clawkit/docs/release-playbook.md`.
