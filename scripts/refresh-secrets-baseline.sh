#!/usr/bin/env bash
set -euo pipefail

git ls-files -z | xargs -0 python3 -m detect_secrets scan \
  --exclude-files '(^|/)pnpm-lock\.yaml$' \
  --exclude-files '(^|/)\.secrets\.baseline$' \
  --exclude-files '(^|/)\.detect-secrets\.cfg$' \
  > .secrets.baseline

echo "Updated .secrets.baseline"
