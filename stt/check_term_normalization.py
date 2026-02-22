#!/usr/bin/env python3
"""Minimal sanity checks for term normalization boundaries.

Run:
    python stt/check_term_normalization.py
"""

from __future__ import annotations

import sys
import types


# Allow importing stt/mlx_hot_service.py without optional runtime deps.
fastapi = types.ModuleType("fastapi")


class _FastAPIStub:
    def __init__(self, *args, **kwargs) -> None:  # noqa: ANN002, ANN003
        self.title = kwargs.get("title", "")

    def on_event(self, *args, **kwargs):  # noqa: ANN002, ANN003
        def decorator(fn):
            return fn

        return decorator

    def get(self, *args, **kwargs):  # noqa: ANN002, ANN003
        def decorator(fn):
            return fn

        return decorator

    def post(self, *args, **kwargs):  # noqa: ANN002, ANN003
        def decorator(fn):
            return fn

        return decorator


class _HTTPExceptionStub(Exception):
    pass


fastapi.FastAPI = _FastAPIStub
fastapi.File = lambda *a, **k: None
fastapi.Form = lambda *a, **k: None
fastapi.HTTPException = _HTTPExceptionStub
fastapi.UploadFile = object
sys.modules["fastapi"] = fastapi

mlx_whisper = types.ModuleType("mlx_whisper")
mlx_whisper.transcribe = lambda *a, **k: {"text": "", "language": None, "segments": []}
sys.modules["mlx_whisper"] = mlx_whisper

from mlx_hot_service import HotWhisperService


def main() -> None:
    sample = "CLASS CLAUDE CLA cla Cla cLa"
    normalized = HotWhisperService._normalize_terms(sample)

    assert "CLASS" in normalized, normalized
    assert "CLAUDE" in normalized, normalized
    assert " CLI " in f" {normalized} ", normalized
    assert " cli " in f" {normalized} ", normalized
    assert " Cli " in f" {normalized} ", normalized
    assert "cLa" not in normalized, normalized

    print("ok: normalization keeps CLASS/CLAUDE untouched and converts standalone CLA variants")


if __name__ == "__main__":
    main()
