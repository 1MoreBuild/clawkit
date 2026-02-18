#!/usr/bin/env python3

import difflib
import json
import sys
from pathlib import Path


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    payload.pop("generated_at", None)
    return payload


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: check-secrets-baseline.py <baseline> <generated>", file=sys.stderr)
        return 2

    baseline_path = Path(sys.argv[1])
    generated_path = Path(sys.argv[2])

    baseline = load_json(baseline_path)
    generated = load_json(generated_path)

    if baseline == generated:
        return 0

    baseline_text = json.dumps(baseline, indent=2, sort_keys=True).splitlines(keepends=True)
    generated_text = json.dumps(generated, indent=2, sort_keys=True).splitlines(keepends=True)
    diff = difflib.unified_diff(
        baseline_text,
        generated_text,
        fromfile=str(baseline_path),
        tofile=str(generated_path),
    )
    sys.stdout.writelines(diff)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
