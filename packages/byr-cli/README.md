# byr-pt-cli

CLI for `byr.pt` with stable machine-readable output (`--json`) and script-friendly commands for browse/search/details/download/auth/user/meta.

## Install

```bash
npm i -g byr-pt-cli
byr help
```

## Quick start

```bash
# Use cookie (recommended)
export BYR_COOKIE='uid=...; pass=...'

# Or username/password
# export BYR_USERNAME='...'
# export BYR_PASSWORD='...'

byr search --query "ubuntu" --limit 5
byr get --id 1001
byr download --id 1001 --output ./1001.torrent --dry-run
```

## Commands

```bash
byr --help
byr --version
byr check --json
byr whoami --json
byr doctor --verify --json
byr browse --limit 20 --category movie --spstate free --json
byr search --query "ubuntu" --limit 5 --category movie --spstate free
byr search --imdb tt0133093 --json
byr get --id 1001
byr download --id 1001 --output ./1001.torrent
byr user info --json
byr meta categories --json
byr meta levels --json
byr auth status --verify --json
byr auth login --username "<username>" --password "<password>" --json
byr auth import-cookie --cookie "uid=...; pass=..." --json
byr auth import-cookie --from-browser chrome --profile "Default" --json
byr auth logout --json
```

## Search filters

- `--category` repeatable / comma-separated, accepts alias or numeric ID
- `--incldead` `all|alive|dead` (or `0|1|2`)
- `--spstate` `all|normal|free|2x|2xfree|50|2x50|30` (or `0..7`)
- `--bookmarked` `all|only|unbookmarked` (or `0|1|2`)
- `--imdb` alternative to `--query`
- `--page` page index

## Auth and config

Credential source priority:

`CLI flags > ENV > ./.byrrc.json > ~/.config/byr-cli/config.json > ~/.config/byr-cli/auth.json`

`auth import-cookie` supports:

- legacy BYR cookie: `uid=...; pass=...`
- current session cookie: `session_id=...; auth_token=...` (optional `refresh_token=...`)

## JSON contract

All commands support `--json`.

- success: `{ "ok": true, "data": ..., "meta": ... }`
- error: `{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }`

## Testing

Run package tests and checks:

```bash
pnpm --filter byr-pt-cli test
pnpm --filter byr-pt-cli check
```

Local live smoke (requires valid BYR credentials):

```bash
BYR_LIVE=1 BYR_COOKIE='uid=...; pass=...' pnpm --filter byr-pt-cli test:live
```

Flow: `search -> get -> download --dry-run -> user info`.
