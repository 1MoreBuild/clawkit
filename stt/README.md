# MLX Whisper Hot Service (Apple Silicon)

This directory provides a local always-on speech-to-text (STT) service based on `mlx-whisper`, intended for Apple Silicon. The service preloads and warms up the model at startup to reduce first-request cold-start latency.

## Current behavior (matches code)

- Default model: `mlx-community/whisper-small-mlx`
- Automatic warmup after startup (default 0.6s silence)
- `POST /transcribe` defaults to `language=auto` (auto detect)
- Supported language values: `auto|zh|en`
- Service name: `mlx-whisper-hot-service`

## Files

- `mlx_hot_service.py`: FastAPI service implementation
- `run.sh`: create/repair virtualenv, install dependencies, and start the service
- `benchmark_latency.py`: minimal local latency benchmark script (2-10 second audio)
- `requirements.txt`: Python dependencies

## Start

### One-command start (recommended)

```bash
cd clawkit/stt
./run.sh
```

### Manual start

```bash
cd clawkit/stt
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -r requirements.txt
python mlx_hot_service.py
```

Optional environment variables:

- `MLX_WHISPER_MODEL` (default: `mlx-community/whisper-small-mlx`)
- `HOST` (default: `127.0.0.1`)
- `PORT` (default: `8099`)
- `WARMUP_SECONDS` (default: `0.6`)
- `INITIAL_PROMPT` (term-correction hints; includes OpenClaw/CLI/subagent, etc.)

Example (switch model):

```bash
MLX_WHISPER_MODEL=mlx-community/whisper-medium-mlx ./run.sh
```

## API examples

### Health check

```bash
curl http://127.0.0.1:8099/health
```

### Transcribe (auto language detect, default)

```bash
curl -X POST "http://127.0.0.1:8099/transcribe" \
  -F "file=@/path/to/sample.wav"
```

### Transcribe (force Chinese)

```bash
curl -X POST "http://127.0.0.1:8099/transcribe" \
  -F "file=@/path/to/sample.wav" \
  -F "language=zh"
```

### Transcribe (force English)

```bash
curl -X POST "http://127.0.0.1:8099/transcribe" \
  -F "file=@/path/to/sample.wav" \
  -F "language=en"
```

## Minimal self-check

After service startup:

```bash
# 1) health
curl http://127.0.0.1:8099/health

# 2) generate a 1-second silent wav and call transcribe
python3 - <<'PY'
import wave
with wave.open('/tmp/stt_silence.wav', 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(16000)
    wf.writeframes(b'\x00\x00' * 16000)
print('/tmp/stt_silence.wav')
PY

curl -X POST "http://127.0.0.1:8099/transcribe" \
  -F "file=@/tmp/stt_silence.wav" \
  -F "language=auto"
```

## Known limitations

- First-time model download can be slow (network + Hugging Face reachability)
- Current API supports only `auto|zh|en`
- No chunking/streaming for very long audio; callers should segment audio as needed
- Term correction relies on `initial_prompt` and simple text replacement; 100% accuracy is not guaranteed

## Troubleshooting

### 1) `python: command not found` (commonly caused by a broken venv)

`run.sh` includes auto-repair: if `python` is missing after activation, it recreates `.venv`. Manual steps:

```bash
cd clawkit/stt
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -r requirements.txt
./run.sh
```

### 2) Port already in use

Restart with a different port:

```bash
PORT=8100 ./run.sh
```

### 3) Model download fails or times out

- Check network/proxy settings
- Retry startup command
- Or test with a smaller model first

### 4) Request returns 400: `language must be one of: auto|zh|en`

Ensure `language` is exactly one of: `auto`, `zh`, or `en`.
