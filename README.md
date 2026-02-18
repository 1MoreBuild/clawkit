# clawkit

`clawkit` is a pnpm monorepo for standalone CLI tools and shared CLI contracts.

## Packages

- `byr-pt-cli`: CLI for `byr.pt` (`byr browse/search/get/download/auth/user/meta/check/doctor/whoami`)
- `clawkit-cli-core`: shared envelope/errors/exit-code contracts

## Requirements

- Node.js `>=22.12.0`
- pnpm `10.x`

## Quick Start

```bash
pnpm install
pnpm check
pnpm build
```

Run BYR CLI locally from the workspace:

```bash
pnpm byr:dev -- help
```

Install published CLI globally:

```bash
npm i -g byr-pt-cli
byr help
```

Keep local dev and global install separated:

```bash
# Always local workspace build/output
pnpm byr:dev -- whoami --json

# Inspect which byr is used in shell
which -a byr

# Smoke test install from local tarball (temporary npm prefix, no global pollution)
pnpm byr:smoke-install
```

## Common Commands

```bash
# Full repo quality gate
pnpm check

# Package-only checks
pnpm --filter clawkit-cli-core check
pnpm --filter byr-pt-cli check

# BYR live smoke (local only, requires valid credentials)
BYR_LIVE=1 BYR_COOKIE='uid=...; pass=...' pnpm --filter byr-pt-cli test:live

# Refresh detect-secrets baseline after intentional test-fixture changes
./scripts/refresh-secrets-baseline.sh
```

## Repository Layout

```text
packages/
  cli-core/
  byr-cli/
docs/
  release-playbook.md
  monorepo-conventions.md
  skill-publish.md
```

## Publishing

Release is tag-driven and publishes both npm + Homebrew tap from CI:

```bash
git tag v0.1.7
git push origin v0.1.7
```

Required GitHub Actions secrets:

- `HOMEBREW_TAP_TOKEN`: token with push access to `1MoreBuild/homebrew-tap`

npm publish uses OIDC trusted publishing (`id-token: write` + `npm publish --provenance`), so no `NPM_TOKEN` secret is needed.

Workflow file:

- `.github/workflows/release.yml`

Formula update helper:

- `scripts/update-homebrew-formula.mjs`
- `CHANGELOG.md`

Skill publish workflow is documented in:

- `docs/skill-publish.md`

## License

MIT (`LICENSE`)
