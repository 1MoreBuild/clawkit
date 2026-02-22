#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import os
import re
import tempfile
import time
import wave
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from mlx_whisper import transcribe as mlx_transcribe

DEFAULT_MODEL = os.getenv("MLX_WHISPER_MODEL", "mlx-community/whisper-small-mlx")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8099"))
WARMUP_SECONDS = float(os.getenv("WARMUP_SECONDS", "0.6"))
INITIAL_PROMPT = os.getenv("INITIAL_PROMPT", "Terms: subagent, codex, claude, cli, fallback, OpenClaw")

app = FastAPI(title="mlx-whisper-hot-service", version="0.1.0")


class HotWhisperService:
    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        self.model = model
        self.warmed = False
        self.startup_ts = time.time()

    @staticmethod
    def _language_arg(language: str | None) -> str | None:
        if language in (None, "", "auto"):
            return None
        if language not in {"zh", "en"}:
            raise HTTPException(status_code=400, detail="language must be one of: auto|zh|en")
        return language

    def _transcribe(self, audio_path: str, language: str | None) -> dict:
        return mlx_transcribe(
            audio_path,
            path_or_hf_repo=self.model,
            language=self._language_arg(language),
            word_timestamps=False,
            initial_prompt=INITIAL_PROMPT,
        )

    @staticmethod
    def _normalize_terms(text: str) -> str:
        def _case_aware_cli(match: re.Match[str]) -> str:
            token = match.group(0)
            if token.isupper():
                return "CLI"
            if token.islower():
                return "cli"
            if token[0].isupper() and token[1:].islower():
                return "Cli"
            return "CLI"

        out = text
        out = re.sub(r"\bSubsiderAgent\b", "subagent", out, flags=re.IGNORECASE)
        out = re.sub(r"\bSubsider\s+Agent\b", "subagent", out, flags=re.IGNORECASE)
        out = re.sub(r"\bCLA\b", _case_aware_cli, out, flags=re.IGNORECASE)
        out = re.sub(r"\bFallback\b", "fallback", out, flags=re.IGNORECASE)
        out = re.sub(r"\bOpen\s+claw\b", "OpenClaw", out, flags=re.IGNORECASE)
        return out

    def warmup(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            warmup_path = Path(f.name)

        try:
            sample_rate = 16000
            frames = int(sample_rate * WARMUP_SECONDS)
            with wave.open(str(warmup_path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.writeframes(b"\x00\x00" * frames)

            self._transcribe(str(warmup_path), language="auto")
            self.warmed = True
        finally:
            warmup_path.unlink(missing_ok=True)


service = HotWhisperService()


@app.on_event("startup")
async def startup_event() -> None:
    await asyncio.to_thread(service.warmup)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": app.title,
        "model": service.model,
        "warmed": service.warmed,
        "uptime_sec": round(time.time() - service.startup_ts, 3),
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Literal["auto", "zh", "en"] = Form("auto"),
) -> dict:
    suffix = Path(file.filename or "upload.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    try:
        started = time.perf_counter()
        result = await asyncio.to_thread(service._transcribe, str(tmp_path), language)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

        text = service._normalize_terms((result.get("text") or "").strip())
        detected_lang = result.get("language")

        return {
            "text": text,
            "language": detected_lang,
            "requested_language": language,
            "elapsed_ms": elapsed_ms,
            "segments": result.get("segments", []),
            "model": service.model,
        }
    finally:
        tmp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("mlx_hot_service:app", host=HOST, port=PORT, reload=False)
