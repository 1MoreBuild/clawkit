#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"

if [[ ! -d "${VENV_DIR}" ]]; then
  python3 -m venv "${VENV_DIR}"
fi

# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

if ! command -v python >/dev/null 2>&1; then
  rm -rf "${VENV_DIR}"
  python3 -m venv "${VENV_DIR}"
  # shellcheck disable=SC1091
  source "${VENV_DIR}/bin/activate"
fi

python -m pip install --upgrade pip >/dev/null
python -m pip install -r "${SCRIPT_DIR}/requirements.txt"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8099}"

exec python "${SCRIPT_DIR}/mlx_hot_service.py"
