#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/byr-cli"

EXPECTED_VERSION="$(node -e "const fs=require('node:fs');const p=JSON.parse(fs.readFileSync('$PKG_DIR/package.json','utf8'));process.stdout.write(p.version)")"

pnpm --filter byr-pt-cli build >/dev/null

pushd "$PKG_DIR" >/dev/null
PACK_FILE="$(npm pack --silent | tail -n 1)"
popd >/dev/null

TMP_PREFIX="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_PREFIX"
  rm -f "$PKG_DIR/$PACK_FILE"
}

trap cleanup EXIT

npm i -g --prefix "$TMP_PREFIX" "$PKG_DIR/$PACK_FILE" >/dev/null

SMOKE_BYR="$TMP_PREFIX/bin/byr"
if [[ ! -e "$SMOKE_BYR" ]]; then
  echo "smoke install failed: byr binary not found in temporary prefix" >&2
  exit 1
fi

VERSION_OUTPUT="$(node "$SMOKE_BYR" --version)"
if [[ "$VERSION_OUTPUT" != "byr-pt-cli $EXPECTED_VERSION" ]]; then
  echo "smoke install failed: unexpected version output: $VERSION_OUTPUT" >&2
  exit 1
fi

node "$SMOKE_BYR" help >/dev/null
echo "Smoke install passed: $VERSION_OUTPUT"
