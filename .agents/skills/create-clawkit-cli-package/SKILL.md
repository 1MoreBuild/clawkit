---
name: create-clawkit-cli-package
description: Create a new standalone CLI package under clawkit/packages with shared cli-core contract, tests, publish-ready scripts, and monorepo-compliant layout.
---

# create-clawkit-cli-package

Use this skill when asked to add a new CLI package to the `clawkit` monorepo.

## Scope

- Create package only under `packages/<tool>-cli`.
- Reuse `@onemoreproduct/cli-core` contracts.
- Do not create a new repository.
- Do not create runtime skill files in this skill. Use `add-clawhub-skill-to-package` for that.

## Required inputs

- `tool_name` (kebab-case, for example `byr`)
- `scope` (default: `@onemoreproduct`)
- `commands` (at least one read command; side-effect commands need dry-run)

## Package baseline

Create:

```text
packages/<tool>-cli/
  package.json
  tsconfig.json
  src/
    index.ts
    cli.ts
    commands/
    domain/
  test/
  README.md
```

## Hard requirements

- Human-readable output by default.
- `--json` outputs `CliEnvelope` from `@onemoreproduct/cli-core`.
- Side-effect commands support `--dry-run`.
- Error codes follow `E_ARG_*`, `E_AUTH_*`, `E_NOT_FOUND_*`, `E_UPSTREAM_*`, `E_UNKNOWN`.
- Exit codes follow `0/2/3/4/5/10` via `mapErrorCodeToExitCode`.

## Scripts baseline

Add package scripts:

- `build`
- `test`
- `typecheck`
- `check`

Keep package publish independent (`pnpm --filter <pkg> publish`).

## Tests baseline

At minimum add tests for:

- argument validation
- `--json` envelope contract
- `--dry-run` behavior on side-effect command
- one mock upstream integration test

## Final response checklist

1. list created files
2. list commands run
3. show quick usage examples
4. mention TODOs if any
