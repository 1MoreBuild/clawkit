# Release Playbook (`byr-pt-cli`)

This document is the operational guide for publishing npm + Homebrew in one flow.

## Primary Path (Recommended)

Release is tag-driven via GitHub Actions:

1. Update `CHANGELOG.md` with `X.Y.Z` release notes.
2. Verify version in `packages/byr-cli/package.json`.
3. Push tag:
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
4. Watch workflow: `.github/workflows/release.yml`.

## What CI Does

1. Installs dependencies and runs:
   - `pnpm check`
   - `pnpm --filter byr-pt-cli build`
2. Publishes npm package:
   - `npm publish --provenance --access public` (inside `packages/byr-cli`)
3. Waits until `npm view byr-pt-cli@X.Y.Z version` is available.
4. Downloads npm tarball and computes SHA256.
5. Checks out `1MoreBuild/homebrew-tap`.
6. Updates `Formula/byr-pt-cli.rb` using:
   - `scripts/update-homebrew-formula.mjs`
7. Commits and pushes formula update.

## Required Repository Secrets

- `HOMEBREW_TAP_TOKEN`

Also required for npm publish: GitHub Actions OIDC permission (`permissions: id-token: write`) and npm Trusted Publisher binding for this repo/workflow.

## Failure Recovery

### npm already published, workflow failed later

- Re-run workflow using `workflow_dispatch` with the same tag.
- Pipeline is idempotent for npm publish and will continue to formula sync.

### Homebrew formula update failed

1. Confirm `HOMEBREW_TAP_TOKEN` push permission.
2. Re-run workflow for same tag.
3. If manual hotfix needed:
   - Compute tarball URL and SHA256.
   - Run:
     - `node scripts/update-homebrew-formula.mjs --formula <path> --version X.Y.Z --url <tarball-url> --sha256 <sha256>`
   - Commit and push to `1MoreBuild/homebrew-tap`.

### Tag/version mismatch

- Ensure `vX.Y.Z` equals `packages/byr-cli/package.json` `version`.
- Fix version, retag with a new version, push new tag.

## Post-Release Verification

1. `npm view byr-pt-cli version`
2. `npm i -g byr-pt-cli@X.Y.Z && byr --version`
3. `brew update && brew install 1MoreBuild/tap/byr-pt-cli && byr --version`
