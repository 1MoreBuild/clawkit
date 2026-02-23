---
name: agent-search
description: Use Agent Search CLI to run agentic web search with selectable engines (claude/codex), configurable default engine, and JSON envelopes.
---

# Agent Search Skill

## Commands

- `agent-search search --query "<query>" --json`
- `agent-search search --query "<query>" --deep --json`
- `agent-search search --query "<query>" --engine claude --json`
- `agent-search search --query "<query>" --engine codex --json`
- `agent-search config --set-default codex --json`
- `agent-search config --show --json`
- `agent-search doctor --json`
- `agent-search doctor --auth --json`

## Output fields

- `query`
- `engine`
- `count`
- `results[]`
  - `title`
  - `url`
  - `summary`
  - `source_type`
