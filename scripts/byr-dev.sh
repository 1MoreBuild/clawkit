#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
pnpm --filter byr-pt-cli build >/dev/null

if [[ "${1:-}" == "--" ]]; then
  shift
fi

node "$ROOT_DIR/packages/byr-cli/dist/index.mjs" "$@"
