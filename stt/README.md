# MLX Whisper Hot Service (Apple Silicon)

本目录提供一个本地常驻语音转写（STT）服务（基于 `mlx-whisper`），面向 Apple Silicon。服务启动时会预加载并预热模型，以降低首请求冷启动延迟。

## 当前行为（与代码一致）

- 默认模型：`mlx-community/whisper-small-mlx`
- 启动后自动 warmup（默认静音 0.6 秒）
- `POST /transcribe` 默认 `language=auto`（自动识别）
- 支持 `language=auto|zh|en`
- 服务名：`mlx-whisper-hot-service`

## 目录

- `mlx_hot_service.py`：FastAPI 服务实现
- `run.sh`：创建/修复虚拟环境、安装依赖并启动服务
- `benchmark_latency.py`：最小本地延迟基准脚本（2~10 秒音频）
- `requirements.txt`：Python 依赖

## 启动方式

### 一键启动（推荐）

```bash
cd clawkit/stt
./run.sh
```

### 手动启动

```bash
cd clawkit/stt
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -r requirements.txt
python mlx_hot_service.py
```

可选环境变量：

- `MLX_WHISPER_MODEL`（默认：`mlx-community/whisper-small-mlx`）
- `HOST`（默认：`127.0.0.1`）
- `PORT`（默认：`8099`）
- `WARMUP_SECONDS`（默认：`0.6`）
- `INITIAL_PROMPT`（术语纠错提示，已内置 OpenClaw/CLI/subagent 等）

示例（切换模型）：

```bash
MLX_WHISPER_MODEL=mlx-community/whisper-medium-mlx ./run.sh
```

## API 调用示例

### 健康检查

```bash
curl http://127.0.0.1:8099/health
```

### 转写（自动语言识别，默认）

```bash
curl -X POST "http://127.0.0.1:8099/transcribe" \
  -F "file=@/path/to/sample.wav"
```

### 转写（指定中文）

```bash
curl -X POST "http://127.0.0.1:8099/transcribe" \
  -F "file=@/path/to/sample.wav" \
  -F "language=zh"
```

### 转写（指定英文）

```bash
curl -X POST "http://127.0.0.1:8099/transcribe" \
  -F "file=@/path/to/sample.wav" \
  -F "language=en"
```

## 最小自检

服务启动后执行：

```bash
# 1) health
curl http://127.0.0.1:8099/health

# 2) 生成一个 1 秒静音 wav 并发起 transcribe
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

## 已知限制

- 首次下载模型时会较慢（依赖网络与 Hugging Face 可达性）
- 当前接口仅支持 `auto|zh|en` 三种语言参数
- 对超长音频未做分片与流式处理，建议调用方自行切片
- 术语纠错基于 `initial_prompt` 与简单文本替换，不能保证 100% 命中

## 排障

### 1) `python: command not found`（常见于 venv 损坏）

`run.sh` 已内置自动修复：若激活后找不到 `python`，会删除并重建 `.venv`。手动处理命令如下：

```bash
cd clawkit/stt
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -r requirements.txt
./run.sh
```

### 2) 端口被占用

修改端口重新启动：

```bash
PORT=8100 ./run.sh
```

### 3) 模型下载失败或超时

- 检查网络与代理设置
- 重试启动命令
- 或先切换到体积更小模型验证链路

### 4) 请求报 400：`language must be one of: auto|zh|en`

请确认 `language` 参数仅为：`auto`、`zh`、`en`。
