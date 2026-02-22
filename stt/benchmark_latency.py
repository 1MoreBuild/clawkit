#!/usr/bin/env python3
from __future__ import annotations

import argparse
import tempfile
import time
import wave
from pathlib import Path

import requests


SAMPLE_RATE = 16000


def make_silent_wav(path: Path, duration_sec: int) -> None:
    frames = SAMPLE_RATE * duration_sec
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b"\x00\x00" * frames)


def run_once(base_url: str, audio_path: Path, language: str) -> float:
    started = time.perf_counter()
    with audio_path.open("rb") as fh:
        resp = requests.post(
            f"{base_url}/transcribe",
            files={"file": (audio_path.name, fh, "audio/wav")},
            data={"language": language},
            timeout=120,
        )
    resp.raise_for_status()
    return (time.perf_counter() - started) * 1000


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark local mlx-whisper hot service")
    parser.add_argument("--base-url", default="http://127.0.0.1:8099")
    parser.add_argument("--language", choices=["auto", "zh", "en"], default="auto")
    parser.add_argument("--min-sec", type=int, default=2)
    parser.add_argument("--max-sec", type=int, default=10)
    args = parser.parse_args()

    print(f"Benchmarking {args.base_url} ({args.language=})")
    print("duration_sec,latency_ms")

    for d in range(args.min_sec, args.max_sec + 1):
        with tempfile.NamedTemporaryFile(suffix=f"_{d}s.wav", delete=False) as tf:
            path = Path(tf.name)
        try:
            make_silent_wav(path, d)
            latency = run_once(args.base_url, path, args.language)
            print(f"{d},{latency:.2f}")
        finally:
            path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
