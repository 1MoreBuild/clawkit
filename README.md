# clawkit

`clawkit` is a pnpm monorepo for standalone CLI tools and shared CLI contracts.

## Packages

- `byr-pt-cli`: CLI for `byr.pt` (`byr search/get/download/auth/user/meta`)
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

Publish npm package:

```bash
pnpm --filter byr-pt-cli publish --access public
```

Skill publish workflow is documented in:

- `docs/skill-publish.md`

## License

MIT (`LICENSE`)
