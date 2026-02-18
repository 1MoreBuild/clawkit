# Changelog

All notable changes to this repository are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- (no unreleased entries yet)

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
