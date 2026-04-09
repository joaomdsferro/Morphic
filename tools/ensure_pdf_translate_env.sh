#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR/tools/pdf-translator"
PYTHON_VERSION="${MORPHIC_PDF_PYTHON_VERSION:-3.12}"

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv for local Python environment management..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

echo "Syncing local PDF translator Python environment..."
uv python install "$PYTHON_VERSION"
uv sync --project "$PROJECT_DIR" --python "$PYTHON_VERSION"

echo "Ensuring Argos language models (en<->pt) are installed..."
uv run --project "$PROJECT_DIR" --python "$PYTHON_VERSION" python "$PROJECT_DIR/bootstrap_models.py"
