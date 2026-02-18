# Clawkit Monorepo Conventions

## Scope

This repository hosts independent CLI packages under `packages/*`.

Each CLI package follows a two-layer model:

1. CLI layer: `packages/<tool>-cli`
2. OpenClaw Skill layer: `packages/<tool>-cli/skill-openclaw`

`blucli` and `wacli` are pattern references only and are not vendored here.

## Folder Model

```text
packages/
  cli-core/
  <tool>-cli/
    src/
    test/
    skill-openclaw/
```

- `packages/cli-core`: shared behavior contracts and helpers.
- `packages/<tool>-cli`: standalone npm package and executable.
- `packages/<tool>-cli/skill-openclaw`: skill bundle intended for ClawHub publish.

## Skill Separation Rules

- Runtime skill source of truth: `packages/<tool>-cli/skill-openclaw`.
- Coding-agent workflow skills: `.agents/skills/*`.
- Do not mix these two purposes.

## CLI Contracts

All CLI packages in this monorepo must follow:

- Default output is human-readable text.
- `--json` returns envelope:
  - success: `{ "ok": true, "data": ..., "meta": ... }`
  - error: `{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }`
- Side-effect commands support `--dry-run`.
- Exit code mapping:
  - `0`: success
  - `2`: argument validation errors (`E_ARG_*`)
  - `3`: auth/config errors (`E_AUTH_*`)
  - `4`: not found (`E_NOT_FOUND_*`)
  - `5`: upstream/network (`E_UPSTREAM_*`)
  - `10`: unknown (`E_UNKNOWN`)

## Package Independence Rules

- Each CLI package has its own `package.json`, `bin`, `exports`, and tests.
- Package runtime dependencies must be declared in the package itself.
- Root `package.json` is only for workspace tooling.

## Release and Publish Rules

- Every CLI package follows independent semver.
- Package publish is done per package: `pnpm --filter <package-name> publish`.
- Skill publish is done from package-local skill folder (see `docs/skill-publish.md`).

## Plugin Phase

A later phase can add `openclaw-plugin/` under each CLI package. Current baseline is CLI + skill only.
