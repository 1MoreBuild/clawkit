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
pnpm --filter byr-pt-cli build
pnpm --filter byr-pt-cli exec byr help
```

Install published CLI globally:

```bash
npm i -g byr-pt-cli
byr help
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
```

## Repository Layout

```text
packages/
  cli-core/
  byr-cli/
docs/
  monorepo-conventions.md
  skill-publish.md
```

## Publishing

Release is tag-driven and publishes both npm + Homebrew tap from CI:

```bash
git tag v0.1.6
git push origin v0.1.6
```

Required GitHub Actions secrets:

- `NPM_TOKEN`: npm publish token for `byr-pt-cli`
- `HOMEBREW_TAP_TOKEN`: token with push access to `1MoreBuild/homebrew-tap`

Workflow file:

- `.github/workflows/release.yml`

Formula update helper:

- `scripts/update-homebrew-formula.mjs`

Skill publish workflow is documented in:

- `docs/skill-publish.md`

## License

MIT (`LICENSE`)
