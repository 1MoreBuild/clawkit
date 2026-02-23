# agent-search-cli

Agentic web search CLI with pluggable engines (Claude/Codex).

## Install

```bash
pnpm --filter agent-search-cli build
pnpm --filter agent-search-cli exec node dist/index.mjs help
```

## Usage

```bash
agent-search search --query "OpenClaw docs" --engine claude --json
agent-search search --query "OpenClaw docs" --deep --json
agent-search config --set-default codex --json
agent-search config --show --json
agent-search doctor --json
agent-search doctor --auth --json
```

## Output

JSON success envelope includes:

- `query`
- `engine`
- `count`
- `results[]` with `title`, `url`, `summary`, `source_type`
