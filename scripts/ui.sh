#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Ferramentas locais
NODE_BIN="$(find "$ROOT/.tools" -maxdepth 2 -type d -name bin -path '*node*' 2>/dev/null | head -1)"
export PATH="$ROOT/bin:${NODE_BIN:-}:$PATH"

# Build do front (se existir)
if [ -d "$ROOT/web" ] && [ -f "$ROOT/web/package.json" ]; then
  echo "▶ Build do front..."
  (cd "$ROOT/web" && npm install --silent && npm run build)
  rm -rf "$ROOT/api/static"
  mkdir -p "$ROOT/api/static"
  cp -r "$ROOT/web/dist/." "$ROOT/api/static/"
fi

# Start
PORT="${PORT:-8000}"
echo ""
echo "▶ UI rodando em http://localhost:$PORT"
echo "  Cmd+Shift+P → Simple Browser: Show → http://localhost:$PORT"
echo ""
exec "$ROOT/.venv/bin/uvicorn" api.app:app --host 0.0.0.0 --port "$PORT"
