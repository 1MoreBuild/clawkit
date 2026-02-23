---
name: agent-search
description: Use Agent Search CLI to run agentic web search with selectable engines (claude/codex), configurable default engine, and JSON envelopes.
metadata:
  {
    "openclaw":
      {
        "skillKey": "agent-search",
        "homepage": "https://clawhub.ai",
        "requires": { "bins": ["agent-search"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "agent-search-cli",
              "tap": "1MoreBuild/tap",
              "bins": ["agent-search"],
              "label": "Install agent-search CLI (Homebrew)",
            },
            {
              "id": "node",
              "kind": "node",
              "package": "agent-search-cli",
              "bins": ["agent-search"],
              "label": "Install agent-search CLI (npm fallback)",
            },
          ],
      },
  }
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
