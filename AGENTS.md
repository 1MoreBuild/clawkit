# AGENTS.md

## Release Source Of Truth

Use `.github/workflows/release.yml` as the canonical release pipeline for `byr-pt-cli`.

## How To Release

1. Ensure `/Users/bytedance/Projects/clawkit/packages/byr-cli/package.json` version is the target version.
2. Create and push a matching tag:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
3. Do not run manual `npm publish` or manual Homebrew formula edits unless the workflow fails.

## Required Secrets (GitHub Actions)

- `NPM_TOKEN`: npm publish token for `byr-pt-cli`
- `HOMEBREW_TAP_TOKEN`: token that can push to `1MoreBuild/homebrew-tap`

## Workflow Behavior

The release workflow does:

1. `pnpm check` + package build.
2. Publish `byr-pt-cli` to npm (skip if already published).
3. Wait for npm propagation.
4. Resolve tarball URL + SHA256.
5. Update and push `Formula/byr-pt-cli.rb` in `1MoreBuild/homebrew-tap`.

## Manual Recovery

If release fails, follow `/Users/bytedance/Projects/clawkit/docs/release-playbook.md`.
