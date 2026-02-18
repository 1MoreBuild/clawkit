# Changelog

All notable changes to this repository are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- (no unreleased entries yet)

## [0.1.8] - 2026-02-18

### Fixed

- Replaced published dependency range `clawkit-cli-core=workspace:^0.1.0` with npm-compatible semver `^0.1.0`, fixing `npm i -g byr-pt-cli` and Homebrew install failures (`EUNSUPPORTEDPROTOCOL`).

### Changed

- Added publish-manifest guard (`check:publish-manifest`) to fail checks when any published dependency uses `workspace:` protocol.

## [0.1.7] - 2026-02-18

### Changed

- Release pipeline switched npm publishing to OIDC trusted publishing (`id-token: write` + `npm publish --provenance --access public`).
- Removed long-lived `NPM_TOKEN` dependency from CI release path; Homebrew sync remains token-based via `HOMEBREW_TAP_TOKEN`.
- Updated release docs/playbook to reflect tag-driven OIDC + Homebrew one-pass workflow.

## [0.1.6] - 2026-02-18

### Fixed

- Browser cookie import: sanitized non-ASCII and malformed cookie values before persistence.
- Chrome import: stripped host digest prefix from decrypted cookie payloads to prevent binary garbage in `session_id` / `auth_token`.
- Auth handling: invalid persisted cookie values now return `E_AUTH_INVALID` instead of low-level ByteString errors.

### Changed

- Strengthened auth/browser import tests and isolated CLI tests from local `~/.config/byr-cli` state.

## [0.1.5] - 2026-02-18

### Added

- `byr browse` command with BYR filter support (`category`, `incldead`, `spstate`, `bookmarked`, `page`).
- `byr doctor` command with local diagnostics and optional online verification (`--verify`).
- `byr auth login` command (username/password flow with persisted cookie store).

### Changed

- Unified torrent list query builder for `search` and `browse`.
- Fixed IMDb-only search parameter handling in upstream client.
- Expanded build outputs and tests for the new command surface.

## [0.1.0 - 0.1.4] - 2026-02-14 to 2026-02-18

### Added

- Initial `clawkit` monorepo with `clawkit-cli-core` and `byr-pt-cli`.
- JSON envelope contract, exit-code mapping, dry-run support, BYR auth/config model.
- Core commands: `search`, `get`, `download`, `auth`, `user info`, `meta`.
- Global command UX improvements (`--help`, `--version`, `check`, `whoami`).

### Changed

- Browser cookie import compatibility updates.
- Packaging/docs improvements for npm + Homebrew installation paths.
