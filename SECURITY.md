# Security Policy

If you discover a security issue in `clawkit`, report it privately.

## Reporting

- Open a private GitHub security advisory in this repository, or
- Email: `security@onemoreproduct.dev`

Include:

1. affected component and version
2. reproduction steps
3. impact assessment
4. suggested remediation (if available)

## Scope

This repository currently contains:

- `byr-pt-cli`
- `clawkit-cli-core`

Issues in third-party services (for example `byr.pt`) are out of scope unless there is a direct vulnerability in this codebase.

## Secrets Scanning

This repository uses `detect-secrets` baseline checks in CI.

- baseline file: `.secrets.baseline`
- config hints: `.detect-secrets.cfg`
- refresh script: `scripts/refresh-secrets-baseline.sh`
- compare script: `scripts/check-secrets-baseline.py`

When a legitimate test fixture is flagged, update the baseline in the same PR with justification.
